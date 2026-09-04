# Visual tokens and zoom

The v0.13.13 visual system keeps literal colors in `frontend/src/theme/tokens.ts` and writes semantic `--pg-*` custom properties at runtime for CSS and canvas consumers. Application zoom is applied to `#root`; portal content is zoomed separately so MUI anchor geometry remains in visual pixels. The document root is fixed to prevent absolute virtualized pane children from enlarging document `scrollHeight`; pane-local overflow remains unchanged.
