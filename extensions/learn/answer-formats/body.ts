/** The contract every answer format's editor body meets inside the Work tab's editor shell. */
export type BodyHandle = {
  /** Replaces the whole document, e.g. after reloading from disk. Not an edit: no onChange. */
  setDoc: (text: string) => void;
};

export type BodyProps = {
  /** Read once, on mount; later documents come through `setDoc`. */
  initial: string;
  onChange: (text: string) => void;
};
