# CONTEXT.md format

`CONTEXT.md` is a project glossary maintained inline as a `/grill` session resolves domain-specific terms. It is *not* a spec, scratch pad, or implementation-detail record.

## Structure

```md
# {Context name}

{One or two sentences on what this context is and why it exists.}

## Language

**Order**:
A request from a Customer to receive goods or services.
_Avoid_: Purchase, transaction

**Invoice**:
A request for payment sent to a Customer after delivery.
_Avoid_: Bill, payment request

**Customer**:
A person or organization that places Orders.
_Avoid_: Client, buyer, account

## Relationships

- An **Order** produces one or more **Invoices**
- An **Invoice** belongs to exactly one **Customer**

## Example dialogue

> **Dev:** "When a **Customer** places an **Order**, do we create the **Invoice** immediately?"
> **Domain expert:** "No — an **Invoice** is only generated once a **Fulfillment** is confirmed."

## Flagged ambiguities

- "account" was used to mean both **Customer** and **User** — resolved: these are distinct concepts.
```

## Rules

- **Be opinionated.** When multiple words exist for the same concept, pick one and list the others as aliases to avoid.
- **Flag conflicts explicitly.** If a term is used ambiguously, surface it under "Flagged ambiguities" with a clear resolution.
- **Keep definitions tight.** One sentence max. Define what it IS, not what it does.
- **Show relationships.** Use bold term names and express cardinality where obvious.
- **Only project-specific terms.** Concepts unique to this codebase's domain. General programming concepts (timeouts, error types, utility patterns) don't belong even if used heavily. Before adding a term, ask: is this unique to this context, or just general programming? Only the former.
- **Group under subheadings** when natural clusters emerge. A flat list is fine if all terms belong to one cohesive area.
- **Write an example dialogue.** A short conversation between a dev and a domain expert that demonstrates how the terms interact and clarifies boundaries between related concepts.

## Single vs multi-context repos

**Single context (most repos):** one `CONTEXT.md` at the repo root.

**Multiple contexts:** a `CONTEXT-MAP.md` at the repo root lists the contexts, where they live, and how they relate:

```md
# Context map

## Contexts

- [Ordering](./src/ordering/CONTEXT.md) — receives and tracks customer orders
- [Billing](./src/billing/CONTEXT.md) — generates invoices and processes payments
- [Fulfillment](./src/fulfillment/CONTEXT.md) — manages warehouse picking and shipping

## Relationships

- **Ordering → Fulfillment**: Ordering emits `OrderPlaced` events; Fulfillment consumes them
- **Fulfillment → Billing**: Fulfillment emits `ShipmentDispatched` events; Billing generates invoices
- **Ordering ↔ Billing**: shared types for `CustomerId` and `Money`
```

Detection rules used by `/grill`:

- If `CONTEXT-MAP.md` exists, read it to locate the relevant `CONTEXT.md`.
- If only a root `CONTEXT.md` exists, treat the repo as a single context.
- If neither exists when a domain term first resolves, ask the user once whether to create a root `CONTEXT.md`. If declined, skip glossary writes for the rest of the session.

When multiple contexts exist, infer which one the current topic relates to. If unclear, ask.
