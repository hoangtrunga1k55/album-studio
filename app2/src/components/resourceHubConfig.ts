/** Resource Hub content — EDIT THIS to point at your own promo pages/links.
 *  Every `href` opens in the system browser (external). Leave "" to disable a
 *  button. Swap `image` for a data-URI or an asset URL later. */

export interface HubTab {
  id: string;
  label: string;
  /** headline shown large over the banner. */
  title: string;
  /** supporting line under the title. */
  body: string;
  /** big banner image (data URI / asset URL). Empty = gradient placeholder. */
  image: string;
  /** primary + secondary call-to-action buttons (external links). */
  primary?: { label: string; href: string };
  secondary?: { label: string; href: string };
  /** highlight this tab (e.g. SHOP NOW) in the accent colour. */
  accent?: boolean;
}

/** Fill these in with your real campaigns / links. */
export const HUB_TABS: HubTab[] = [
  {
    id: "news",
    label: "WHAT'S NEW",
    title: "Album Studio",
    body: "Tạo album cưới nhanh với kho layout, typo và element sẵn có.",
    image: "",
    primary: { label: "Tìm hiểu thêm", href: "" },
    secondary: { label: "Xem cập nhật", href: "" },
  },
  {
    id: "tutorials",
    label: "TUTORIALS",
    title: "Hướng dẫn",
    body: "Video hướng dẫn thiết kế album từ A đến Z.",
    image: "",
    primary: { label: "Xem hướng dẫn", href: "" },
  },
  {
    id: "services",
    label: "DỊCH VỤ",
    title: "Dịch vụ của chúng tôi",
    body: "Thiết kế album, chỉnh sửa ảnh, in ấn — liên hệ để được tư vấn.",
    image: "",
    primary: { label: "Liên hệ", href: "" },
  },
  {
    id: "shop",
    label: "SHOP NOW",
    title: "Kho tài nguyên",
    body: "Mua thêm gói layout / typo / element cao cấp.",
    image: "",
    primary: { label: "Mua ngay", href: "" },
    accent: true,
  },
];
