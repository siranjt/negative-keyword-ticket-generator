export default function ZocaLogo({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ height: 26, width: "auto" }}
    >
      <text
        x="0"
        y="26"
        fontFamily="'Montserrat', sans-serif"
        fontWeight="900"
        fontSize="28"
        fill="#F3EDFD"
        letterSpacing="-0.02em"
      >
        ZOCA
      </text>
    </svg>
  );
}
