import styles from "./belay.module.css";

export type Fact = [label: string, value: React.ReactNode];

/** A detail page's facts table (grill Q12): three columns, small uppercase labels above values, a hairline under it. */
export function Facts({ facts }: { facts: Fact[] }) {
  return (
    <dl className={styles.facts}>
      {facts.map(([label, value]) => (
        <div key={label} className={styles.fact}>
          <dt className={styles.factLabel}>{label}</dt>
          <dd className={styles.factValue}>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A fact with no value. */
export const None = ({ children = "None" }: { children?: React.ReactNode }) => <span className={styles.none}>{children}</span>;
