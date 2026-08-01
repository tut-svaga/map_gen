FROM node:24-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build:production

FROM node:24-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci 

COPY --from=build /app/build ./build

CMD ["npm", "start"]