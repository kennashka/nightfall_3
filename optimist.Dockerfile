FROM mongo:4.4.1-bionic

# install node
RUN apt-get update

# TEMPORARY WORKAROUND FOR ISSUE https://github.com/nodesource/distributions/issues/1266
RUN apt-get install -y ca-certificates

RUN apt-get install -y curl
RUN curl -sL https://deb.nodesource.com/setup_14.x | bash -
RUN apt-get install -y nodejs
RUN apt-get install -y netcat

WORKDIR /
COPY common-files common-files
COPY config/default.js app/config/default.js

WORKDIR /app
RUN mkdir /app/mongodb

COPY nightfall-optimist/src src
COPY nightfall-optimist/docker-entrypoint.sh nightfall-optimist/pre-start-script.sh nightfall-optimist/package*.json ./

RUN npm ci

EXPOSE 80

# websocket port 8080
EXPOSE 8080

ENTRYPOINT ["/app/docker-entrypoint.sh"]

CMD ["npm", "start"]