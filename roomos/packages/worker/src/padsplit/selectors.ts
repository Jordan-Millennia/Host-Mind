// Verified against the live host UI April 2026 (per Channel-Manager source).
// PadSplit's React app uses Material UI and exposes data-testid attributes
// on most interactive elements; we prefer those over class selectors.
export const SELECTORS = {
  // Session marker
  hostNav: '[data-testid="host-app-bar"]',

  // Rooms table page
  roomsSearchField: '[data-testid="host-rooms__search-field"]',
  roomsSortDropdown: '[data-testid="host-rooms__sorting-dropdown"]',
  propertyLink: 'a[data-testid="rooms-table__property-link"]',

  // Listing detail page
  heroAddress: '[data-testid="hero__property-address-txt"]',
  heroCity: '[data-testid="hero__property-city-txt"]',
  propertyStatus: '[data-testid="property-status__status"]',
  bedroomsSeeAllLink: '[data-testid="bedrooms__see-all-lnk"]',
  roomCard: ".Room_root__XM73E",
  roomMoreBtn: '[data-testid="room__more-btn"]',

  // Member profile (financials drill-down — to be verified live in Task 8)
  memberBalance: '[data-testid="member__balance"]',
  memberDaysPastDue: '[data-testid="member__days-past-due"]',
  memberLastPayment: '[data-testid="member__last-payment"]',
} as const
