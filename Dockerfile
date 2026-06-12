FROM oven/bun:1

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .

ARG VITE_SONIOX_API_KEY_US
ARG VITE_SONIOX_API_KEY_EU
ARG VITE_SONIOX_API_KEY_JP
RUN VITE_SONIOX_API_KEY_US=$VITE_SONIOX_API_KEY_US \
    VITE_SONIOX_API_KEY_EU=$VITE_SONIOX_API_KEY_EU \
    VITE_SONIOX_API_KEY_JP=$VITE_SONIOX_API_KEY_JP \
    bun run build

EXPOSE 4173
CMD ["bun", "x", "vite", "preview", "--host", "0.0.0.0"]
