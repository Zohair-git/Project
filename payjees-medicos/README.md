# Payjees Medicos - Medicine Demand Book

A simple, mobile-first PWA for recording medicines that customers request but are currently unavailable, then generating the next medicine order list.

## V1 features
- Add medicine by typing
- Voice input (browser support dependent)
- Quantity controls
- Medicine autocomplete from previous entries
- Today's order list
- Pending / Ordered status
- Previous orders by date
- Branded PDF download
- WhatsApp order sharing
- Copy order text
- Offline PWA support
- IndexedDB local storage
- JSON backup and restore

## Storage note
V1 is offline-first and stores records locally on the device in IndexedDB. A cloud-sync backend can be added later while keeping the same UI.
