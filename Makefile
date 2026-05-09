install:
	@if [ ! -d node_modules/vite ]; then bun add -D vite; fi

build:
	bun run build

serve:
	bun x vite preview --host 0.0.0.0
