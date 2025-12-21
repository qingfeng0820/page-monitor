import asyncio
import time
import logging
import os
from typing import Dict, Any, Tuple, List, Optional
from datetime import datetime
import threading
from pymongo import UpdateOne

from mongodb import stats_collection

# 配置 - 从环境变量获取，没有则使用默认值
BATCH_SIZE = int(os.getenv("BATCH_SIZE", "50"))  # 达到50条记录时触发批量更新
BATCH_INTERVAL = int(os.getenv("BATCH_INTERVAL", "5"))  # 每5秒触发一次批量更新
BATCH_MAX_QUEUE_SIZE = int(os.getenv("BATCH_MAX_QUEUE_SIZE", "10000"))  # 最大队列长度
BATCH_RETRY_MAX_ATTEMPTS = int(os.getenv("BATCH_RETRY_MAX_ATTEMPTS", "3"))  # 最大重试次数
BATCH_RETRY_BASE_DELAY = float(os.getenv("BATCH_RETRY_BASE_DELAY", "1.0"))  # 重试基础延迟（秒）

logger = logging.getLogger(__name__)


class BatchProcessor:
    """高性能异步批处理器"""
    
    def __init__(self):
        # 主队列：用于接收新数据
        self.queue = asyncio.Queue(maxsize=BATCH_MAX_QUEUE_SIZE)
        
        # 工作状态
        self.running = False
        self.worker_task: Optional[asyncio.Task] = None
        self.flush_event = asyncio.Event()  # 用于触发刷新
        
        # 批量缓存
        self._batch_lock = asyncio.Lock()  # 用于保护批量缓存
        
        # 指标
        self._metrics_lock = threading.Lock()  # 使用线程锁保护指标
        self.metrics = {
            'total_processed': 0,
            'total_errors': 0,
            'queue_size': 0,
            'last_flush_time': None,
            'avg_batch_size': 0.0,
            'total_batches': 0,
            'avg_process_time': 0.0,
            'rejects_due_to_full_queue': 0,  # 新增：因队列满拒绝的数量
            'dropped_after_max_retries': 0,  # 新增：重试后丢弃的数量
        }
        
    async def start(self):
        """启动批处理工作器"""
        if self.running:
            return
            
        self.running = True
        self.worker_task = asyncio.create_task(self._batch_worker())
        logger.info("Batch processor started")
        
    async def stop(self):
        """停止批处理工作器，等待所有数据处理完成"""
        if not self.running:
            return
            
        logger.info("Stopping batch processor...")
        self.running = False
        
        # 触发最后一次刷新
        self.flush_event.set()
        
        if self.worker_task:
            # 等待工作器完成
            try:
                await self.worker_task
            except asyncio.CancelledError:
                pass
                
        # 处理队列中剩余的数据
        if not self.queue.empty():
            await self._flush_batch(force=True)
            
        logger.info("Batch processor stopped gracefully")
        
    async def add(self, key: Tuple[str, str, str], update_fields: Dict[str, Any]) -> bool:
        """
        添加数据到批处理队列
        
        Args:
            key: (system, date, track_type) 三元组
            update_fields: MongoDB更新操作
            
        Returns:
            bool: 是否成功加入队列
        """
        # 队列满时的处理策略：等待而不是丢弃
        try:
            # 尝试非阻塞放入队列
            self.queue.put_nowait((key, update_fields))
            success = True
        except asyncio.QueueFull:
            # 队列满时，改为阻塞等待（有超时）
            try:
                await asyncio.wait_for(
                    self.queue.put((key, update_fields)),
                    timeout=1.0  # 等待1秒
                )
                success = True
            except asyncio.TimeoutError:
                # 超时后拒绝新数据并记录指标
                logger.warning(f"Queue full, rejecting data after timeout: {key}")
                with self._metrics_lock:
                    self.metrics['rejects_due_to_full_queue'] += 1
                success = False
        
        # 更新指标（线程安全）
        with self._metrics_lock:
            self.metrics['queue_size'] = self.queue.qsize()
        
        # 如果队列达到批处理大小，立即触发处理
        if success and self.queue.qsize() >= BATCH_SIZE:
            self.flush_event.set()
            
        return success
        
    async def _batch_worker(self):
        """批处理工作器主循环 - 优化版"""
        last_flush_time = time.time()
        
        while self.running:
            try:
                current_time = time.time()
                time_since_last_flush = current_time - last_flush_time
                
                # 等待触发条件：事件或超时
                try:
                    # 等待刷新事件或超时
                    await asyncio.wait_for(
                        self.flush_event.wait(),
                        timeout=max(0.1, BATCH_INTERVAL - time_since_last_flush)
                    )
                    self.flush_event.clear()  # 清除事件
                except asyncio.TimeoutError:
                    pass  # 正常超时，继续检查处理条件
                
                # 检查处理条件
                current_queue_size = self.queue.qsize()
                should_flush = (
                    (current_queue_size >= BATCH_SIZE) or
                    (time.time() - last_flush_time >= BATCH_INTERVAL and current_queue_size > 0)
                )
                
                if should_flush:
                    start_time = time.time()
                    await self._flush_batch()
                    process_time = time.time() - start_time
                    
                    last_flush_time = time.time()
                    
                    # 记录处理时间指标
                    with self._metrics_lock:
                        self.metrics['last_flush_time'] = datetime.utcnow().isoformat()
                        self.metrics['avg_process_time'] = (
                            (self.metrics['avg_process_time'] * self.metrics['total_batches'] + 
                             process_time) / (self.metrics['total_batches'] + 1)
                        )
                
                # 动态调整等待时间：队列越满，检查越频繁
                if current_queue_size < BATCH_SIZE / 2:
                    await asyncio.sleep(0.5)  # 队列不饱满，减少检查频率
                    
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Batch worker error: {e}", exc_info=True)
                await asyncio.sleep(1)  # 出错后休眠1秒
                
    async def _flush_batch(self, force: bool = False):
        """刷新当前批次到数据库 - 优化版"""
        # 快速检查是否需要处理
        if self.queue.empty() and not force:
            return

        start_time = time.time()
        items_to_process = []
        try:
            # 1. 从队列中取出待处理项
            max_items = BATCH_SIZE * 2  # 每次最多处理两倍的批处理大小
            
            while len(items_to_process) < max_items:
                try:
                    item = self.queue.get_nowait()
                    items_to_process.append(item)
                except asyncio.QueueEmpty:
                    break
            
            if not items_to_process:
                return
                
            # 2. 合并更新操作（使用锁保护）
            batch_cache = {}
            async with self._batch_lock:
                # 先处理队列中的新数据
                for key, update_fields in items_to_process:
                    if key in batch_cache:
                        batch_cache[key] = self._merge_update_fields(
                            batch_cache[key], update_fields
                        )
                    else:
                        batch_cache[key] = update_fields
            
            # 3. 执行批量写入（不使用锁，避免阻塞）
            if batch_cache:
                success, failed_operations = await self._execute_bulk_write(batch_cache)
                
                # 4. 处理失败的操作
                if failed_operations:
                    await self._handle_failed_operations(failed_operations)
                
                # 5. 更新指标并检查是否需要重置
                with self._metrics_lock:                    
                    # 检查是否需要重置指标（当total_processed超过100万时）
                    if self.metrics['total_processed'] >= 1000000:
                        logger.info(f"Batch processor metrics reset (total_processed={self.metrics['total_processed']})")
                        self.metrics = {
                            'total_processed': 0,
                            'total_errors': 0,
                            'queue_size': self.queue.qsize(),  # 保留当前队列大小
                            'last_flush_time': self.metrics['last_flush_time'],  # 保留最后刷新时间
                            'avg_batch_size': 0.0,
                            'total_batches': 0,
                            'avg_process_time': 0.0,
                            'rejects_due_to_full_queue': 0,
                            'dropped_after_max_retries': 0,
                        }
                    self.metrics['total_processed'] += len(items_to_process)
                    self.metrics['total_batches'] += 1
                    current_avg = self.metrics['avg_batch_size']
                    new_count = self.metrics['total_batches']
                    self.metrics['avg_batch_size'] = (
                        (current_avg * (new_count - 1) + len(batch_cache)) / new_count
                    )
                    self.metrics['queue_size'] = self.queue.qsize()

        except Exception as e:
            logger.error(f"Batch flush error: {e}", exc_info=True)
            with self._metrics_lock:
                self.metrics['total_errors'] += 1
                
        finally:
            # 处理时间过长时记录警告
            process_time = time.time() - start_time
            if process_time > 1.0:
                logger.warning(f"Batch {len(items_to_process)} records and flush took {process_time:.3f}s")

    async def _execute_bulk_write(self, batch_cache: Dict) -> tuple:
        """
        执行批量写入，返回失败的操作列表

        Args:
            batch_cache: 批量缓存数据

        Returns:
            tuple: (success: bool, failed_operations: List[tuple])
            其中 failed_operations 是 [(key, update_fields, retry_count), ...] 列表
            添加retry_count用于跟踪重试次数
        """
        if not batch_cache:
            return True, []

        # 将batch_cache转换为有序列表以跟踪索引
        items = list(batch_cache.items())  # [(key1, fields1), (key2, fields2), ...]

        bulk_operations = []
        valid_items = []  # 跟踪有效项目

        for i, ((system, date, track_type), update_fields) in enumerate(items):
            try:
                # 验证关键字段
                if not system or not date or not track_type:
                    logger.warning(f"Skipping invalid item with missing key fields: {system}, {date}, {track_type}")
                    continue

                # 验证更新字段
                if not isinstance(update_fields, dict):
                    logger.warning(f"Skipping invalid update_fields for {system}: not a dict")
                    continue

                filter_criteria = {
                    'system': system,
                    'date': date,
                    'type': track_type
                }

                # 验证更新操作字段
                validated_update = {}
                for op_key, op_value in update_fields.items():
                    if op_key.startswith('$') and isinstance(op_value, dict):
                        validated_update[op_key] = op_value
                    else:
                        logger.warning(f"Invalid MongoDB operation {op_key} in update_fields for {system}")

                if not validated_update:
                    logger.warning(f"No valid MongoDB operations found for {system}")
                    continue

                # 使用正确的UpdateOne对象
                bulk_operations.append(
                    UpdateOne(
                        filter=filter_criteria,
                        update=validated_update,
                        upsert=True
                    )
                )
                valid_items.append(i)  # 记录有效项目的索引

            except Exception as e:
                logger.warning(f"Error processing item {i} for {system}: {e}")
                continue

        if not bulk_operations:
            logger.warning("No valid operations to execute in bulk write")
            return True, []

        try:
            start_time = time.time()

            result = await stats_collection.bulk_write(
                bulk_operations,
                ordered=False,
                bypass_document_validation=False
            )

            duration = time.time() - start_time

            # 检查是否有写错误
            write_errors = []
            if hasattr(result, 'bulk_api_result'):
                bulk_result = result.bulk_api_result
                write_errors = bulk_result.get('writeErrors', []) if isinstance(bulk_result, dict) else []
            elif hasattr(result, 'write_errors'):
                write_errors = result.write_errors

            if write_errors:
                logger.warning(f"Bulk write had {len(write_errors)} write errors")

                # 收集失败的操作（添加retry_count=0）
                failed_operations = []
                failed_indices = {error.get('index') for error in write_errors if
                                  isinstance(error, dict) and 'index' in error}

                for idx in failed_indices:
                    # 确保索引有效且对应于有效项目
                    if idx is not None and isinstance(idx, int) and idx < len(valid_items):
                        original_idx = valid_items[idx]  # 获取原始索引
                        if original_idx < len(items):
                            key, update_fields = items[original_idx]
                            failed_operations.append((key, update_fields, 0))

                success_count = len(bulk_operations) - len(failed_operations)
                logger.warning(
                    f"Batch write partial failures: "
                    f"success={success_count}, failed={len(failed_operations)}"
                )
                return False, failed_operations

            # 全部成功
            logger.debug(
                f"Batch write: ops={len(bulk_operations)}, "
                f"matched={getattr(result, 'matched_count', 'N/A')}, modified={getattr(result, 'modified_count', 'N/A')}, "
                f"duration={duration:.3f}s"
            )
            return True, []

        except Exception as e:
            logger.error(f"Bulk write failed: {type(e).__name__}: {e}", exc_info=True)
            logger.error(f"Attempting to write {len(bulk_operations)} operations")

            # 记录操作详情用于调试（仅记录前几个避免日志过大）
            for i, op in enumerate(bulk_operations[:3]):
                logger.error(f"Sample operation {i}: {op}")
            if len(bulk_operations) > 3:
                logger.error(f"... and {len(bulk_operations) - 3} more operations")

            # 整个批量失败，所有操作都失败（添加retry_count=0）
            failed_operations = []
            for idx in valid_items:
                if idx < len(items):
                    key, update_fields = items[idx]
                    failed_operations.append((key, update_fields, 0))
            return False, failed_operations

    async def _retry_operation(self, key: Tuple, update_fields: Dict, current_retry_count: int = 0) -> bool:
        """重试失败的操作"""
        if current_retry_count >= BATCH_RETRY_MAX_ATTEMPTS:
            return False

        # 指数退避
        delay = min(BATCH_RETRY_BASE_DELAY * (2 ** current_retry_count), 30)
        await asyncio.sleep(delay)

        try:
            # 重新放入队列
            success = await self.add(key, update_fields)
            if success:
                logger.debug(f"Retry {current_retry_count + 1} succeeded for key: {key}")
                return True
            else:
                # 队列满，增加重试计数并继续重试
                return await self._retry_operation(key, update_fields, current_retry_count + 1)

        except Exception as e:
            logger.error(f"Retry {current_retry_count + 1} failed: {e}")
            return await self._retry_operation(key, update_fields, current_retry_count + 1)

    async def _handle_failed_operations(self, failed_operations: List[tuple]):
        """处理失败的操作"""
        for key, update_fields, retry_count in failed_operations:
            # 检查是否超过最大重试次数
            if retry_count >= BATCH_RETRY_MAX_ATTEMPTS:
                with self._metrics_lock:
                    self.metrics['dropped_after_max_retries'] += 1
                logger.error(f"Operation dropped after max retries: {key}")
                continue

            # 尝试重新放入队列（传递当前重试次数）
            retry_success = await self._retry_operation(key, update_fields, retry_count)

            if not retry_success:
                with self._metrics_lock:
                    self.metrics['dropped_after_max_retries'] += 1
                logger.error(f"Operation dropped: {key}")

    def get_batch_metrics(self) -> Dict[str, Any]:
        """
        获取批处理器的统计指标
        
        Returns:
            Dict[str, Any]: 包含所有批处理统计指标的字典
        """
        with self._metrics_lock:
            return self.metrics.copy()  # 返回副本以避免外部修改

    def _merge_update_fields(self, existing: Dict, new: Dict) -> Dict:
        """
        合并两个MongoDB更新字段字典（优化版）

        注意：这个函数假设existing和new都是有效的MongoDB更新操作字典
        """
        result = existing.copy()

        # 合并$inc操作 - 这是关键的计数累加操作
        if '$inc' in new:
            if '$inc' not in result:
                result['$inc'] = {}
            for key, value in new['$inc'].items():
                if key in result['$inc']:
                    result['$inc'][key] += value  # 累加数值
                else:
                    result['$inc'][key] = value

        # 合并$set操作 - 通常用于设置固定值
        if '$set' in new:
            if '$set' not in result:
                result['$set'] = {}
            result['$set'].update(new['$set'])

        # 合并$addToSet操作 - 用于添加唯一值到集合
        if '$addToSet' in new:
            if '$addToSet' not in result:
                result['$addToSet'] = {}
            for key, value in new['$addToSet'].items():
                if key in result['$addToSet']:
                    # 处理$each的情况
                    if isinstance(value, dict) and '$each' in value:
                        if isinstance(result['$addToSet'][key], dict) and '$each' in result['$addToSet'][key]:
                            # 合并两个$each数组，去重
                            existing_values = set(result['$addToSet'][key]['$each'])
                            new_values = set(value['$each'])
                            merged_values = list(existing_values.union(new_values))
                            result['$addToSet'][key]['$each'] = merged_values
                        else:
                            # 现有值不是$each，保留现有值并添加新值
                            existing_value = result['$addToSet'][key]
                            new_values = set(value['$each'])
                            new_values.add(existing_value)
                            result['$addToSet'][key] = {
                                '$each': list(new_values)
                            }
                    else:
                        # 简单值处理
                        pass  # $addToSet本身就会处理唯一性，不需要额外操作
                else:
                    result['$addToSet'][key] = value

        # 合并其他MongoDB操作符（如$push, $pull等）
        for operator in ['$push', '$pull', '$pullAll']:
            if operator in new:
                if operator not in result:
                    result[operator] = {}
                # 对于$push等操作，简单合并即可
                if operator == '$push':
                    # 特殊处理$push，可能需要合并数组
                    for key, value in new[operator].items():
                        if key in result[operator]:
                            if isinstance(result[operator][key], list) and isinstance(value, list):
                                result[operator][key].extend(value)
                            elif isinstance(result[operator][key], dict) and isinstance(value, dict):
                                if '$each' in result[operator][key] and '$each' in value:
                                    result[operator][key]['$each'].extend(value['$each'])
                                else:
                                    result[operator][key] = value
                            else:
                                result[operator][key] = value
                        else:
                            result[operator][key] = value
                else:
                    result[operator].update(new[operator])

        return result

    def get_metrics(self) -> Dict[str, Any]:
        """获取处理指标（线程安全）"""
        with self._metrics_lock:
            metrics_copy = self.metrics.copy()
        
        # 添加实时信息
        metrics_copy['is_running'] = self.running
        metrics_copy['current_time'] = datetime.utcnow().isoformat()
        metrics_copy['queue_size'] = self.queue.qsize()  # 实时队列大小
        
        return metrics_copy
    
    async def wait_for_empty_queue(self, timeout: float = 30.0):
        """等待队列为空（用于优雅关闭）"""
        start_time = time.time()
        while self.running and not self.queue.empty():
            if time.time() - start_time > timeout:
                logger.warning(f"Timeout waiting for empty queue")
                break
            await asyncio.sleep(0.1)
