import base from "./playwright.visual.config"
export default { ...base, use: { ...base.use, baseURL: "http://127.0.0.1:1421" }, webServer: undefined }
