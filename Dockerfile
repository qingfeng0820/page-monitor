# 第一阶段：构建阶段
FROM node:20-alpine AS builder

# 设置工作目录
WORKDIR /app

# 安装压缩工具
RUN npm install -g terser csso-cli

# 复制源文件
COPY public/monitor/chart.js public/monitor/
COPY public/monitor/webfonts/ public/monitor/webfonts/
COPY public/monitor/fontawesome.css public/monitor/
COPY public/monitor/*.html public/monitor/
COPY public/monitor/*.css src/monitor/
COPY public/pagemonitor.js src/
COPY public/monitor/*.js src/monitor/

# 压缩混淆文件
# 使用shell遍历压缩所有JS文件（除了chart.js）
RUN find src -name "*.js" -not -name "chart.js" -type f | while read -r js_file; do \
    # 生成目标路径：将src/替换为public/，将.js替换为.min.js
    target_file=$(echo "$js_file" | sed 's|^src/|public/|;s|\.js$|\.min\.js|'); \
    # 确保目标目录存在
    mkdir -p "$(dirname "$target_file")"; \
    # 执行压缩混淆
    terser --compress --mangle -o "$target_file" "$js_file"; \
done && \
# 使用shell遍历压缩所有CSS文件
find src -name "*.css" -type f | while read -r css_file; do \
    # 生成目标路径：将src/替换为public/，将.css替换为.min.css
    target_file=$(echo "$css_file" | sed 's|^src/|public/|;s|\.css$|\.min\.css|'); \
    # 确保目标目录存在
    mkdir -p "$(dirname "$target_file")"; \
    # 执行CSS压缩
    csso "$css_file" -o "$target_file"; \
done

# 使用单条正则表达式替换所有CSS和JS文件引用为.min版本（排除chart.js、webfonts目录下的文件和fontawesome.css）
RUN sed -i -E '/(chart\.js|webfonts\/|fontawesome\.css)/! { s/(href|src)="([^"]+)\.(css|js)"/\1="\2.min.\3"/g }' public/monitor/*.html

# 第二阶段：运行阶段
FROM python:3.11-alpine

# 设置工作目录
WORKDIR /app

# 复制requirements.txt并安装依赖
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 复制应用代码
COPY *.py .

# 从构建阶段复制处理后的文件
COPY --from=builder /app/public/ /app/public/

# 设置环境变量和暴露端口
ENV MONGO_DB_CONN_STR="mongodb://localhost:27017/"
ENV ALLOW_ORIGINS=""
EXPOSE 8000

# 启动应用，使用4个worker进程提高并发处理能力
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4"]

# build 命令： sudo docker build -t simple-track .
# 运行命令: sudo docker run -d --name simple-track -p 8000:8000 -e MONGO_DB_CONN_STR="mongodb://localhost:27017/" simple-track:latest
