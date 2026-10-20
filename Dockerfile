# Stage 1: build the frontend.
FROM node:24-alpine AS frontend
WORKDIR /src/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: build the server and the health probe as static binaries.
FROM golang:1.26-alpine AS backend
WORKDIR /src/backend
COPY backend/go.mod ./
RUN go mod download
COPY backend/ ./
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/server ./cmd/server \
 && CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/healthcheck ./cmd/healthcheck

# Stage 3: minimal runtime image. The Go binary serves both the API and the
# built frontend, so one container runs the whole application.
FROM gcr.io/distroless/static-debian12:nonroot
WORKDIR /app
COPY --from=backend /out/server /app/server
COPY --from=backend /out/healthcheck /app/healthcheck
COPY --from=frontend /src/frontend/dist /app/frontend/dist
ENV PORT=8080 \
    STATIC_DIR=/app/frontend/dist
EXPOSE 8080
USER nonroot:nonroot
# distroless has no shell or curl, so the health check is a Go binary
# that requests GET /api/v1/health and exits non-zero unless it gets 200.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD ["/app/healthcheck"]
ENTRYPOINT ["/app/server"]
