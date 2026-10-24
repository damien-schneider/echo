const MEGABYTES_PER_GIGABYTE = 1000;

export const formatModelSize = (sizeMb: number | null | undefined): string => {
  if (!(sizeMb && Number.isFinite(sizeMb)) || sizeMb <= 0) {
    return "Unknown size";
  }

  if (sizeMb >= MEGABYTES_PER_GIGABYTE) {
    const sizeGb = sizeMb / MEGABYTES_PER_GIGABYTE;
    const formatter = new Intl.NumberFormat(undefined, {
      maximumFractionDigits: sizeGb >= 10 ? 0 : 1,
      minimumFractionDigits: sizeGb >= 10 ? 0 : 1,
    });
    return `${formatter.format(sizeGb)} GB`;
  }

  const formatter = new Intl.NumberFormat(undefined, {
    maximumFractionDigits: sizeMb >= 100 ? 0 : 1,
    minimumFractionDigits: sizeMb >= 100 ? 0 : 1,
  });

  return `${formatter.format(sizeMb)} MB`;
};
