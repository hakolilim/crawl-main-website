# Sử dụng image chính thức của Playwright đã cài sẵn Node.js và mọi dependencies của Browser
FROM mcr.microsoft.com/playwright:v1.49.0-noble

WORKDIR /app

# Sao chép package.json và cài đặt dependencies
COPY package*.json ./
RUN npm install

# Sao chép toàn bộ mã nguồn
COPY . .

# Build Next.js
RUN npm run build

# Biến môi trường mặc định cho cổng
ENV PORT=10000
EXPOSE 10000

# Lệnh chạy ứng dụng
CMD ["npm", "start"]