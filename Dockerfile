FROM oven/bun:1

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .

ARG VITE_SONIOX_API_KEY
RUN VITE_SONIOX_API_KEY=$VITE_SONIOX_API_KEY bun run build

EXPOSE 4173
CMD ["bun", "x", "vite", "preview", "--host", "0.0.0.0"]
