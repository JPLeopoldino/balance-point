import type { SVGProps } from "react";

export function Logo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 200 200"
      width={200}
      height={200}
      fill="currentColor"
      {...props}
    >
      <rect width={145.507} height={74.338} x={40.556} y={12.578} rx={37.169} />
      <rect width={44.571} height={44.571} x={68.739} y={142.851} rx={22.285} />
      <rect width={109.605} height={56.874} x={13.937} y={85.977} rx={28.437} />
    </svg>
  );
}
