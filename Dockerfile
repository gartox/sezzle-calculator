# Toolchain versions: Node 24 (LTS) for the frontend build and Go 1.26.10 for
# the server. The Go tag is pinned because backend/go.mod requires 1.26.10 and
# the official image sets GOTOOLCHAIN=local, so an older 1.26 image would fail
# instead of downloading the newer toolchain.
#
# Every base image is pinned by digest, with the tag kept for readers, so a
# rebuild uses exactly the bytes that were scanned. Dependabot proposes digest
# updates for each of them.

# Stage 1: build the frontend.
FROM node:26-alpine@sha256:6f08a523443ddedf52941874c203475b0ad503e859ad70cb26ab8be9a517dbd5 AS frontend
WORKDIR /src/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: build the server and the health probe as static binaries.
FROM golang:1.26.10-alpine@sha256:9ce231b28998b32e116927c61aa5c406183061d4f3f2d61b292c88e7f6bdf7ca AS backend
WORKDIR /src/backend
COPY backend/go.mod ./
RUN go mod download
COPY backend/ ./
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/server ./cmd/server \
 && CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/healthcheck ./cmd/healthcheck

# Stage 3: minimal runtime image. The Go binary serves both the API and the
# built frontend, so one container runs the whole application.
FROM gcr.io/distroless/static-debian12:nonroot@sha256:afa5c872c891853ca7fcf1f12c3edb23f7eeef36189728842dd51042ff57f7ab
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
