import type { SVGProps } from "react";

function Icon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    />
  );
}

export const SearchIcon = () => (
  <Icon><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></Icon>
);
export const BellIcon = () => (
  <Icon><path d="M6 9a6 6 0 1 1 12 0c0 5 2 6.5 2 6.5H4S6 14 6 9Z" /><path d="M10 19a2 2 0 0 0 4 0" /></Icon>
);
export const MailIcon = () => (
  <Icon><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3.5 7 8.5 6 8.5-6" /></Icon>
);
export const DotsIcon = () => (
  <Icon fill="currentColor" stroke="none"><circle cx="5" cy="12" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="19" cy="12" r="1.7" /></Icon>
);
export const CaretIcon = () => (
  <Icon width="14" height="14"><path d="m6 9 6 6 6-6" /></Icon>
);
