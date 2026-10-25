import { terrain } from "@/lib/course-art";

/** The course's contour terrain in currentColor, cropped to fill its box. */
export function CourseTerrain({
  slug,
  width,
  height,
  className,
}: {
  slug: string;
  width: number;
  height: number;
  className?: string;
}) {
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid slice"
      className={className}
      aria-hidden
    >
      {terrain(slug, width, height).map(({ d, level }) => (
        <path
          key={level}
          d={d}
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeOpacity={0.28 + level * 0.05}
          strokeWidth={level % 3 === 0 ? 1.5 : 0.9}
        />
      ))}
    </svg>
  );
}
