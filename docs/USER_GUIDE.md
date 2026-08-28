# SIPROCOM SGS - User guide

*Training material - version 1.0*

---

## 1. Signing in

Open the address provided by your administrator and enter your email and
password.

The **FR / EN** switch in the top right is available **before** signing in: if
you do not read French, change the language first. Your choice is saved on your
account and follows you to any workstation.

**Forgot your password?** Contact an administrator - they reset it from the
Users screen.

---

## 2. Who can do what

| | Administrator | Storekeeper | Purchasing | Management |
|---|:---:|:---:|:---:|:---:|
| View stock | ✅ | ✅ | ✅ | ✅ |
| Record receipts / issues | ✅ | ✅ | - | - |
| Validate a document | ✅ | ✅ | - | - |
| Cancel a validated document | ✅ | - | - | - |
| Adjust inventory | ✅ | ✅ | - | - |
| Create / edit a product | ✅ | ✅ | - | - |
| Manage suppliers | ✅ | - | ✅ | - |
| Categories and warehouses | ✅ | - | - | - |
| Acknowledge an alert | ✅ | - | ✅ | - |
| Stock valuation | ✅ | - | - | ✅ |
| Users and audit log | ✅ | - | - | - |

The left menu only shows what you are allowed to use. A missing section is
expected, not a fault.

---

## 3. Recording a goods receipt

> **Goods arriving from a supplier**

1. **Goods receipts** → **New goods receipt**
2. Choose the **receiving warehouse** and the **supplier**
3. Add one line per product: product, quantity, buy price
4. **Save draft**

⚠️ **Stock has not moved yet.** A draft changes nothing - deliberately, so you
can check your entry against the paper delivery note before committing it.

5. Reopen the document, check it, then **Validate receipt**

Stock updates immediately and the movement is recorded with your name and the
time.

---

## 4. Recording a goods issue

> **Sale, damage, sample or internal use**

1. **Goods issues** → **New goods issue**
2. Choose the **source warehouse** and the **reason**
3. Add products and quantities

Under each line the system shows **the quantity actually available** in that
warehouse. Ask for more than is available and the line turns red straight away -
no need to wait for validation to find out.

4. **Save draft**, check it, then **Validate issue**

**If stock is insufficient, validation is refused.** The system does not allow
levels to go below zero. Two possibilities:

- You entered the wrong quantity → correct the document
- The theoretical stock is wrong → make an **inventory adjustment** (§6)

Only an administrator can force an issue into negative stock, and that action is
recorded by name in the audit log.

---

## 5. Transferring between warehouses

1. **Goods issues** → **New goods issue**
2. Reason: **Transfer**
3. Choose the **destination warehouse**
4. Add products, save, validate

The issue and the matching receipt are recorded together. **Goods can never
disappear between the two sites** - either both movements go through, or
neither does.

---

## 6. Adjusting after a physical count

> **The counted stock does not match what is displayed**

1. **Adjustment** menu
2. Choose the warehouse, then the product
3. The **theoretical stock** appears
4. Enter the **counted quantity** - the difference updates live
5. Enter the **reason** - required, at least 3 characters
6. **Record adjustment**

The reason is mandatory because an inventory discrepancy with no explanation
makes an audit impossible six months later. Be specific: "physical count of
15/03, 4 units broken in handling".

---

## 7. Following up alerts

The **Alerts** menu lists products **below the minimum threshold** or
**overstocked**. The red badge in the top bar shows the number of open alerts
from any screen.

Alerts are raised **automatically** after every movement - nothing to trigger by
hand. An alert resolves itself as soon as stock returns within its thresholds.

**Purchasing:** tick ✅ to mark an alert as acknowledged (order placed). It stays
visible but is no longer flagged as new.

The list exports to Excel and PDF.

---

## 8. Reading the reports

**Reports** menu, four tabs:

| Tab | What it is for |
|---|---|
| **Trending products** | The most issued products - to anticipate replenishment |
| **Dormant stock** | Products that are not moving, and the value tied up in them |
| **Summary by category** | Inbound and outbound by product family |
| **Valuation** | Stock value (Administrator and Management only) |

Pick the period with the date fields or the **7 d / 30 d / 90 d** shortcuts.

Every report exports to **Excel** (real numbers, still sortable and summable)
and **PDF** (laid out ready to print).

---

## 9. Tracing a movement

**Movements** menu: the complete journal, filterable by type, warehouse and
period.

Each row shows **who**, **what**, **when**, **how many**, and the **balance
after** the operation.

This journal is append-only: nobody can edit or delete it. A cancellation
creates a reversing movement - the history stays faithful to what actually
happened.

---

## 10. Frequently asked questions

**I cannot find a product in the dropdown.**
It may be deactivated. Check under **Products** with the "All statuses" filter.

**I validated a document by mistake.**
An administrator can cancel it: the system records the reversing movements
automatically. The original document stays visible with the "Cancelled" status.

**Can I delete a product?**
No, only deactivate it. Past movements reference it permanently - deleting it
would erase part of the history.

**Are the displayed figures reliable?**
An administrator can run the **consistency check** from the Adjustment screen:
it recomputes every level from the journal and reports any divergence.

**Does the application work on a tablet?**
Yes. The storekeeper screens are designed for touch use.

---

*Any questions: contact your system administrator.*
