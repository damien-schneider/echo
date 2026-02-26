import { useEffect, useState } from "react";

interface GitHubReleaseAsset {
  browser_download_url: string;
  name: string;
}

interface GithubData {
  downloadLinks: {
    macSilicon: string;
    macIntel: string;
    windows: string;
    linuxAppImage: string;
    linuxDeb: string;
  };
  stars: number | null;
  version: string | null;
}

export function useGithubData() {
  const [data, setData] = useState<GithubData>({
    stars: null,
    version: null,
    downloadLinks: {
      macSilicon: "",
      macIntel: "",
      windows: "",
      linuxAppImage: "",
      linuxDeb: "",
    },
  });

  useEffect(() => {
    // Fetch repo info for stars
    fetch("https://api.github.com/repos/damien-schneider/Echo")
      .then((res) => res.json())
      .then((repoData) => {
        if (repoData.stargazers_count !== undefined) {
          setData((prev) => ({ ...prev, stars: repoData.stargazers_count }));
        }
      })
      .catch((err) => console.error("Failed to fetch repo data", err));

    // Fetch latest release for version and assets
    fetch("https://api.github.com/repos/damien-schneider/Echo/releases/latest")
      .then((res) => res.json())
      .then((releaseData) => {
        const assets = releaseData.assets as GitHubReleaseAsset[];
        if (!assets) {
          return;
        }

        const links = {
          macSilicon:
            assets.find((a) => a.name.endsWith("_aarch64.dmg"))
              ?.browser_download_url || "",
          macIntel:
            assets.find((a) => a.name.endsWith("_x64.dmg"))
              ?.browser_download_url || "",
          windows:
            assets.find((a) => a.name.endsWith("_x64_en-US.msi"))
              ?.browser_download_url || "",
          linuxAppImage:
            assets.find((a) => a.name.endsWith(".AppImage"))
              ?.browser_download_url || "",
          linuxDeb:
            assets.find((a) => a.name.endsWith(".deb"))?.browser_download_url ||
            "",
        };

        setData((prev) => ({
          ...prev,
          version: releaseData.tag_name,
          downloadLinks: links,
        }));
      })
      .catch((err) => console.error("Failed to fetch latest release", err));
  }, []);

  return data;
}
