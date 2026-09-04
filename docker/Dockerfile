FROM node:20-alpine

RUN apk add --no-cache ffmpeg bash

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --production

COPY . .

CMD ["node", "docker/render_worker.js"]
