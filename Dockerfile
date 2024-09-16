FROM node:12-alpine
RUN apk add --no-cache python2 g++ make
WORKDIR /bot
RUN npm install --production
CMD [ "node" "bot.js"]
EXPOSE 80