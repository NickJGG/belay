import { StrokeMark, type IconProps, type MarkProps } from "@/components/layout/logo";

/** Grill's Extension mark: an open flame outline with the ember dot inside. */
export function GrillMark(props: MarkProps) {
  return (
    <StrokeMark
      path="M25 56.5C15 53 10 45 10 37.5C10 28.5 16 22.5 20 16C21 22 23 25 26.5 27C27.5 18 30.5 11 34 6C41 14 54 24 54 38C54 49 45.5 57 35 57.5"
      dot={{ x: 32, y: 43, r: 6 }}
      {...props}
    />
  );
}

/** The flame as a section icon, in currentColor. */
export function GrillIcon(props: IconProps) {
  return <GrillMark tone="current" {...props} />;
}
