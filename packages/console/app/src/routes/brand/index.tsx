import "./index.css"
import { Title, Meta } from "@solidjs/meta"
import { Header } from "~/component/header"
import { Footer } from "~/component/footer"
import { Legal } from "~/component/legal"
import { useI18n } from "~/context/i18n"
import { LocaleLinks } from "~/component/locale-links"
import previewLogoLight from "../../asset/brand/preview-legion-logo-light.png"
import previewLogoDark from "../../asset/brand/preview-legion-logo-dark.png"
import previewLogoLightSquare from "../../asset/brand/preview-legion-logo-light-square.png"
import previewLogoDarkSquare from "../../asset/brand/preview-legion-logo-dark-square.png"
import previewWordmarkLight from "../../asset/brand/preview-legion-wordmark-light.png"
import previewWordmarkDark from "../../asset/brand/preview-legion-wordmark-dark.png"
import previewWordmarkSimpleLight from "../../asset/brand/preview-legion-wordmark-simple-light.png"
import previewWordmarkSimpleDark from "../../asset/brand/preview-legion-wordmark-simple-dark.png"
import logoLightPng from "../../asset/brand/legion-logo-light.png"
import logoDarkPng from "../../asset/brand/legion-logo-dark.png"
import logoLightSquarePng from "../../asset/brand/legion-logo-light-square.png"
import logoDarkSquarePng from "../../asset/brand/legion-logo-dark-square.png"
import wordmarkLightPng from "../../asset/brand/legion-wordmark-light.png"
import wordmarkDarkPng from "../../asset/brand/legion-wordmark-dark.png"
import wordmarkSimpleLightPng from "../../asset/brand/legion-wordmark-simple-light.png"
import wordmarkSimpleDarkPng from "../../asset/brand/legion-wordmark-simple-dark.png"
import logoLightSvg from "../../asset/brand/legion-logo-light.svg"
import logoDarkSvg from "../../asset/brand/legion-logo-dark.svg"
import logoLightSquareSvg from "../../asset/brand/legion-logo-light-square.svg"
import logoDarkSquareSvg from "../../asset/brand/legion-logo-dark-square.svg"
import wordmarkLightSvg from "../../asset/brand/legion-wordmark-light.svg"
import wordmarkDarkSvg from "../../asset/brand/legion-wordmark-dark.svg"
import wordmarkSimpleLightSvg from "../../asset/brand/legion-wordmark-simple-light.svg"
import wordmarkSimpleDarkSvg from "../../asset/brand/legion-wordmark-simple-dark.svg"
const brandAssets = "/legion-brand-assets.zip"

export default function Brand() {
  const i18n = useI18n()
  const downloadFile = async (url: string, filename: string) => {
    try {
      const response = await fetch(url)
      const blob = await response.blob()
      const blobUrl = window.URL.createObjectURL(blob)

      const link = document.createElement("a")
      link.href = blobUrl
      link.download = filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)

      window.URL.revokeObjectURL(blobUrl)
    } catch (error) {
      console.error("Download failed:", error)
      const link = document.createElement("a")
      link.href = url
      link.target = "_blank"
      link.rel = "noopener noreferrer"
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    }
  }

  return (
    <main data-page="enterprise">
      <Title>{i18n.t("brand.title")}</Title>
      <LocaleLinks path="/brand" />
      <Meta name="description" content={i18n.t("brand.meta.description")} />
      <div data-component="container">
        <Header />

        <div data-component="content">
          <section data-component="brand-content">
            <h1>{i18n.t("brand.heading")}</h1>
            <p>{i18n.t("brand.subtitle")}</p>
            <button
              data-component="download-button"
              onClick={() => downloadFile(brandAssets, "legion-brand-assets.zip")}
            >
              {i18n.t("brand.downloadAll")}
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path
                  d="M13.9583 10.6247L10 14.583L6.04167 10.6247M10 2.08301V13.958M16.25 17.9163H3.75"
                  stroke="currentColor"
                  stroke-width="1.5"
                  stroke-linecap="square"
                />
              </svg>
            </button>

            <div data-component="brand-grid">
              <div>
                <img src={previewLogoLight} alt="Legion brand guidelines" />
                <div data-component="actions">
                  <button onClick={() => downloadFile(logoLightPng, "legion-logo-light.png")}>
                    PNG
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path
                        d="M13.9583 10.6247L10 14.583L6.04167 10.6247M10 2.08301V13.958M16.25 17.9163H3.75"
                        stroke="currentColor"
                        stroke-width="1.5"
                        stroke-linecap="square"
                      />
                    </svg>
                  </button>
                  <button onClick={() => downloadFile(logoLightSvg, "legion-logo-light.svg")}>
                    SVG
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path
                        d="M13.9583 10.6247L10 14.583L6.04167 10.6247M10 2.08301V13.958M16.25 17.9163H3.75"
                        stroke="currentColor"
                        stroke-width="1.5"
                        stroke-linecap="square"
                      />
                    </svg>
                  </button>
                </div>
              </div>
              <div>
                <img src={previewLogoDark} alt="Legion brand guidelines" />
                <div data-component="actions">
                  <button onClick={() => downloadFile(logoDarkPng, "legion-logo-dark.png")}>
                    PNG
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path
                        d="M13.9583 10.6247L10 14.583L6.04167 10.6247M10 2.08301V13.958M16.25 17.9163H3.75"
                        stroke="currentColor"
                        stroke-width="1.5"
                        stroke-linecap="square"
                      />
                    </svg>
                  </button>
                  <button onClick={() => downloadFile(logoDarkSvg, "legion-logo-dark.svg")}>
                    SVG
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path
                        d="M13.9583 10.6247L10 14.583L6.04167 10.6247M10 2.08301V13.958M16.25 17.9163H3.75"
                        stroke="currentColor"
                        stroke-width="1.5"
                        stroke-linecap="square"
                      />
                    </svg>
                  </button>
                </div>
              </div>
              <div>
                <img src={previewLogoLightSquare} alt="Legion brand guidelines" />
                <div data-component="actions">
                  <button onClick={() => downloadFile(logoLightSquarePng, "legion-logo-light-square.png")}>
                    PNG
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path
                        d="M13.9583 10.6247L10 14.583L6.04167 10.6247M10 2.08301V13.958M16.25 17.9163H3.75"
                        stroke="currentColor"
                        stroke-width="1.5"
                        stroke-linecap="square"
                      />
                    </svg>
                  </button>
                  <button onClick={() => downloadFile(logoLightSquareSvg, "legion-logo-light-square.svg")}>
                    SVG
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path
                        d="M13.9583 10.6247L10 14.583L6.04167 10.6247M10 2.08301V13.958M16.25 17.9163H3.75"
                        stroke="currentColor"
                        stroke-width="1.5"
                        stroke-linecap="square"
                      />
                    </svg>
                  </button>
                </div>
              </div>
              <div>
                <img src={previewLogoDarkSquare} alt="Legion brand guidelines" />
                <div data-component="actions">
                  <button onClick={() => downloadFile(logoDarkSquarePng, "legion-logo-dark-square.png")}>
                    PNG
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path
                        d="M13.9583 10.6247L10 14.583L6.04167 10.6247M10 2.08301V13.958M16.25 17.9163H3.75"
                        stroke="currentColor"
                        stroke-width="1.5"
                        stroke-linecap="square"
                      />
                    </svg>
                  </button>
                  <button onClick={() => downloadFile(logoDarkSquareSvg, "legion-logo-dark-square.svg")}>
                    SVG
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path
                        d="M13.9583 10.6247L10 14.583L6.04167 10.6247M10 2.08301V13.958M16.25 17.9163H3.75"
                        stroke="currentColor"
                        stroke-width="1.5"
                        stroke-linecap="square"
                      />
                    </svg>
                  </button>
                </div>
              </div>
              <div>
                <img src={previewWordmarkLight} alt="Legion brand guidelines" />
                <div data-component="actions">
                  <button onClick={() => downloadFile(wordmarkLightPng, "legion-wordmark-light.png")}>
                    PNG
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path
                        d="M13.9583 10.6247L10 14.583L6.04167 10.6247M10 2.08301V13.958M16.25 17.9163H3.75"
                        stroke="currentColor"
                        stroke-width="1.5"
                        stroke-linecap="square"
                      />
                    </svg>
                  </button>
                  <button onClick={() => downloadFile(wordmarkLightSvg, "legion-wordmark-light.svg")}>
                    SVG
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path
                        d="M13.9583 10.6247L10 14.583L6.04167 10.6247M10 2.08301V13.958M16.25 17.9163H3.75"
                        stroke="currentColor"
                        stroke-width="1.5"
                        stroke-linecap="square"
                      />
                    </svg>
                  </button>
                </div>
              </div>
              <div>
                <img src={previewWordmarkDark} alt="Legion brand guidelines" />
                <div data-component="actions">
                  <button onClick={() => downloadFile(wordmarkDarkPng, "legion-wordmark-dark.png")}>
                    PNG
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path
                        d="M13.9583 10.6247L10 14.583L6.04167 10.6247M10 2.08301V13.958M16.25 17.9163H3.75"
                        stroke="currentColor"
                        stroke-width="1.5"
                        stroke-linecap="square"
                      />
                    </svg>
                  </button>
                  <button onClick={() => downloadFile(wordmarkDarkSvg, "legion-wordmark-dark.svg")}>
                    SVG
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path
                        d="M13.9583 10.6247L10 14.583L6.04167 10.6247M10 2.08301V13.958M16.25 17.9163H3.75"
                        stroke="currentColor"
                        stroke-width="1.5"
                        stroke-linecap="square"
                      />
                    </svg>
                  </button>
                </div>
              </div>
              <div>
                <img src={previewWordmarkSimpleLight} alt="Legion brand guidelines" />
                <div data-component="actions">
                  <button onClick={() => downloadFile(wordmarkSimpleLightPng, "legion-wordmark-simple-light.png")}>
                    PNG
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path
                        d="M13.9583 10.6247L10 14.583L6.04167 10.6247M10 2.08301V13.958M16.25 17.9163H3.75"
                        stroke="currentColor"
                        stroke-width="1.5"
                        stroke-linecap="square"
                      />
                    </svg>
                  </button>
                  <button onClick={() => downloadFile(wordmarkSimpleLightSvg, "legion-wordmark-simple-light.svg")}>
                    SVG
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path
                        d="M13.9583 10.6247L10 14.583L6.04167 10.6247M10 2.08301V13.958M16.25 17.9163H3.75"
                        stroke="currentColor"
                        stroke-width="1.5"
                        stroke-linecap="square"
                      />
                    </svg>
                  </button>
                </div>
              </div>
              <div>
                <img src={previewWordmarkSimpleDark} alt="Legion brand guidelines" />
                <div data-component="actions">
                  <button onClick={() => downloadFile(wordmarkSimpleDarkPng, "legion-wordmark-simple-dark.png")}>
                    PNG
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path
                        d="M13.9583 10.6247L10 14.583L6.04167 10.6247M10 2.08301V13.958M16.25 17.9163H3.75"
                        stroke="currentColor"
                        stroke-width="1.5"
                        stroke-linecap="square"
                      />
                    </svg>
                  </button>
                  <button onClick={() => downloadFile(wordmarkSimpleDarkSvg, "legion-wordmark-simple-dark.svg")}>
                    SVG
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path
                        d="M13.9583 10.6247L10 14.583L6.04167 10.6247M10 2.08301V13.958M16.25 17.9163H3.75"
                        stroke="currentColor"
                        stroke-width="1.5"
                        stroke-linecap="square"
                      />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </section>
        </div>
        <Footer />
      </div>
      <Legal />
    </main>
  )
}
