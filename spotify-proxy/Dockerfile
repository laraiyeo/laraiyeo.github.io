FROM node:20-alpine

WORKDIR /app

# Install dependencies first so the layer caches across code changes.
COPY package*.json ./
RUN npm install --omit=dev

COPY server.js ./

ENV NODE_ENV=production
# Railway injects PORT; 3000 is only the local default.
EXPOSE 3000

CMD ["node", "server.js"]
