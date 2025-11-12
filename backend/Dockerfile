FROM node:22-alpine

WORKDIR /app

# Install deps first (cache-friendly)
COPY package.json package-lock.json* ./
RUN npm ci || npm install

# Copy source
COPY tsconfig.json ./
COPY src ./src
COPY prisma ./prisma

# Expose & run
EXPOSE 4000
CMD ["npm", "run", "dev"]
