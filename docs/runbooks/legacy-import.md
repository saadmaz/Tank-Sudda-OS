# Legacy import and cut-over

<!-- nav -->

<sub><a href="../../README.md">Project README</a> · <a href="../README.md">Documentation index</a></sub>

> Moving the business from the legacy single-file app to Tank Sudda OS, once.

## What is imported

| Legacy                                               | Becomes                                                             |
| ---------------------------------------------------- | ------------------------------------------------------------------- |
| `config/general` prices, locations, equipment, terms | `settings/general` (only if the new project has no settings yet)    |
| Supervisor and technician names                      | Staff without a sign-in, assignable to jobs                         |
| Orders                                               | Jobs, keeping their reference, status, dates, crew and exact totals |
| Orders with status Inspection, or needing one        | Inspections                                                         |
| Instalments, or "paid" completed orders              | Payments                                                            |
| Name and phone on orders                             | Customers, one per phone number, with every address as a site       |

Totals are kept exact: where the legacy invoice preview changed a price, the job gets an "Adjustment (legacy invoice)" line or a larger discount.

## Steps

1. Freeze the legacy app: tell staff to stop entering orders.
2. Export, with the legacy project's service account in `LEGACY_*`:

   ```sh
   npm run legacy:export -- legacy-export.json
   ```

3. Dry run against the new project (`FIREBASE_*`) and check the counts:

   ```sh
   npm run legacy:import -- legacy-export.json
   ```

4. Import:

   ```sh
   npm run legacy:import -- legacy-export.json --write
   ```

5. Sign in, spot-check a few jobs, customers and this month's dashboard against the legacy app, and give staff their sign-ins under **Staff**.
6. Delete `legacy-export.json` (it holds customer data), then retire the legacy app and lock its Firestore rules.

> [!NOTE]
> Re-running the import overwrites the same documents rather than duplicating them, so a mistake can be corrected by fixing the export and running it again.
