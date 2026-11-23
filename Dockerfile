FROM node:22-bookworm-slim

WORKDIR /app
COPY --chown=node:node server.cjs index.html ./

ENV HOST=0.0.0.0
ENV PORT=8080
EXPOSE 8080

USER node
CMD ["node", "server.cjs"]
