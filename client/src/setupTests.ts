import '@testing-library/jest-dom/vitest';

// jsdom does not implement scrolling; the checkout page scrolls to the top between steps.
window.scrollTo = () => {};
