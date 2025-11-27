FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN if [ -f package-lock.json ]; then \
			npm ci --only=production; \
		else \
			npm install --omit=dev --no-audit --no-fund; \
		fi
COPY . .
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node","server.js"]
