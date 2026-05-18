FROM oven/bun:1

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .

ARG VITE_SONIOX_API_KEY
ARG VITE_REGION
RUN VITE_SONIOX_API_KEY=$VITE_SONIOX_API_KEY VITE_REGION=$VITE_REGION bun run build

EXPOSE 4173
CMD ["bun", "x", "vite", "preview", "--host", "0.0.0.0"]
