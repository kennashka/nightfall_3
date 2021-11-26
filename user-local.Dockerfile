FROM node:14.17

WORKDIR /app
COPY common-files common-files
COPY config/default.js config/default.js
COPY cli cli
WORKDIR /app/cli
RUN npm ci

WORKDIR /app/test/ping-pong/user-local
RUN apt-get update -y
RUN apt-get install -y netcat-openbsd
COPY test/ping-pong/user-local/package*.json test/ping-pong/user-local/pre-start-script.sh ./
COPY test/ping-pong/user-local/src src
COPY test/ping-pong/user-local/docker-entrypoint.sh docker-entrypoint.sh

# websocket port 8080
EXPOSE 8080

RUN npm ci
ENTRYPOINT ["/app/test/ping-pong/user-local/docker-entrypoint.sh"]

CMD ["npm", "start"]
