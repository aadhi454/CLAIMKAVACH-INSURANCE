import React from "react";

interface ClaimKavachLogoProps {
  size?: number | string;
  className?: string;
  color?: string;
  variant?: "vector" | "image";
  showText?: boolean;
}

export const ClaimKavachLogo: React.FC<ClaimKavachLogoProps> = ({
  size = 36,
  className = "",
  color = "#042D4F",
  variant = "vector",
  showText = false,
}) => {
  const pixelSize = typeof size === "number" ? `${size}px` : size;

  return (
    <div className={`inline-flex items-center gap-3 ${className}`}>
      {variant === "image" ? (
        <img
          src="/claimkavach-shield-logo.png"
          alt="ClaimKavach"
          style={{ width: pixelSize, height: pixelSize }}
          className="object-contain drop-shadow-sm select-none"
        />
      ) : (
        <svg
          width={pixelSize}
          height={pixelSize}
          viewBox="0 0 200 230"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="shrink-0 drop-shadow-xs select-none"
        >
          {/* Outer Shield with Curved Top Crest and Tapering Point */}
          <path
            d="M 28 26 
               C 64 42, 85 40, 100 26 
               C 115 40, 136 42, 172 26 
               C 176 96, 172 152, 100 212 
               C 28 152, 24 96, 28 26 Z"
            fill={color}
          />
          {/* Centered Pure White Heart */}
          <path
            d="M 100 148 
               C 96 144, 68 116, 68 88 
               C 68 73, 79 62, 94 62 
               C 99 62, 100 66, 100 66 
               C 100 66, 101 62, 106 62 
               C 121 62, 132 73, 132 88 
               C 132 116, 104 144, 100 148 Z"
            fill="#FFFFFF"
          />
        </svg>
      )}

      {showText && (
        <div className="flex flex-col leading-none">
          <span className="font-heading font-extrabold text-xl tracking-tight text-[#0A0A0A]">
            CLAIM<span className="text-[#0022FF]">KAVACH</span>
          </span>
          <span className="text-[10px] font-mono tracking-widest text-[#64748B] uppercase mt-0.5">
            HEALTHCARE POLICY INTELLIGENCE
          </span>
        </div>
      )}
    </div>
  );
};
