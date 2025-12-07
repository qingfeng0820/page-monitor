# 第一阶段：构建阶段
FROM node:16-alpine AS builder

# 设置工作目录
WORKDIR /app

# 安装压缩工具
RUN npm install -g terser csso-cli

# 复制源文件
COPY *.py .
COPY requirements.txt .
COPY public/monitor/chart.js public/monitor/
COPY public/monitor/webfonts/ public/monitor/webfonts/
COPY public/monitor/fontawesome.css public/monitor/
COPY public/monitor/*.html public/monitor/
COPY public/monitor/index.css src/monitor/
COPY public/pagemonitor.js src/
COPY public/monitor/*.js src/monitor/

# 压缩混淆文件
# 压缩文件（保留基本混淆，避免破坏代码功能）
RUN terser --compress --mangle -o public/pagemonitor.min.js src/pagemonitor.js && \
    terser --compress --mangle -o public/monitor/dataProcessor.min.js src/monitor/dataProcessor.js && \
    terser --compress --mangle -o public/monitor/downloadsCharts.min.js src/monitor/downloadsCharts.js && \
    terser --compress --mangle -o public/monitor/eventCharts.min.js src/monitor/eventCharts.js && \
    terser --compress --mangle -o public/monitor/main.min.js src/monitor/main.js && \
    terser --compress --mangle -o public/monitor/pageViewCharts.min.js src/monitor/pageViewCharts.js && \
    terser --compress --mangle -o public/monitor/ui.min.js src/monitor/ui.js && \
    # 使用csso工具压缩CSS文件
    csso src/monitor/index.css -o public/monitor/index.min.css

RUN sed -i 's/index.css/index.min.css/g' public/monitor/index.html && \
    sed -i 's/pageViewCharts.js/pageViewCharts.min.js/g' public/monitor/index.html && \
    sed -i 's/downloadsCharts.js/downloadsCharts.min.js/g' public/monitor/index.html && \
    sed -i 's/eventCharts.js/eventCharts.min.js/g' public/monitor/index.html && \
    sed -i 's/dataProcessor.js/dataProcessor.min.js/g' public/monitor/index.html && \
    sed -i 's/ui.js/ui.min.js/g' public/monitor/index.html && \
    sed -i 's/main.js/main.min.js/g' public/monitor/index.html && \
    sed -i '/<!-- 外部JavaScript文件引用 -->/d' public/monitor/index.html

# 第二阶段：运行阶段
FROM python:3.9-alpine

# 设置工作目录
WORKDIR /app

# 复制requirements.txt并安装依赖
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 复制应用代码
COPY track.py .

# 从构建阶段复制处理后的文件
COPY --from=builder /app/public/ /app/public/

# 设置环境变量和暴露端口
ENV MONGO_DB_CONN_STR="mongodb://localhost:27017/"
ENV ALLOW_ORIGINS=""
EXPOSE 8000

# 启动应用
CMD ["uvicorn", "track:app", "--host", "0.0.0.0", "--port", "8000"]

# build 命令： sudo docker build -t simple-track .
# 运行命令: sudo docker run -d --name simple-track -p 8000:8000 -e MONGO_DB_CONN_STR="mongodb://localhost:27017/" -e ALLOW_ORIGINS="*" simple-track:latest