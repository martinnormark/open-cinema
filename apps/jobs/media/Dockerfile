# The jobs Worker's media container (Cloudflare Containers): ffmpeg plus a small
# Node server. See server.mjs and docs/background-job.md.
FROM node:24-alpine
RUN apk add --no-cache ffmpeg
WORKDIR /app
COPY server.mjs .
USER node
EXPOSE 8080
CMD ["node", "server.mjs"]
