import type { SVGProps } from "react";

/** Ícone de robô no estilo Heroicons outline (24px). */
export function RobotIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      aria-hidden="true"
      {...props}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4V2.25" />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6.75 9.75h10.5a1.5 1.5 0 0 1 1.5 1.5v6.75a1.5 1.5 0 0 1-1.5 1.5H6.75a1.5 1.5 0 0 1-1.5-1.5v-6.75a1.5 1.5 0 0 1 1.5-1.5Z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 6.75V9.75" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.25 6.75V9.75" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5H5.25" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M18.75 13.5h1.5" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 14.25h.008v.008H9.75v-.008Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.25 14.25h.008v.008H14.25v-.008Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.125 17.25h3.75" />
    </svg>
  );
}
