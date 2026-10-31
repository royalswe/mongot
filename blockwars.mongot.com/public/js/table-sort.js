'use strict';

const textCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

function compareValues(first, second) {
  return textCollator.compare(String(first ?? '').trim(), String(second ?? '').trim());
}

function sortRows(rows, columnIndex, direction = 'ascending') {
  const order = direction === 'descending' ? -1 : 1;
  return rows.slice().sort((first, second) => order * compareValues(
    first.cells[columnIndex].textContent,
    second.cells[columnIndex].textContent
  ));
}

function initSortableTables(documentRef) {
  documentRef.querySelectorAll('table[data-sortable]').forEach(table => {
    const headers = Array.from(table.tHead.rows[0].cells);
    const body = table.tBodies[0];

    headers.forEach((header, columnIndex) => {
      header.setAttribute('aria-sort', 'none');
      header.querySelector('button').addEventListener('click', () => {
        const direction = header.getAttribute('aria-sort') === 'ascending' ? 'descending' : 'ascending';
        headers.forEach(cell => cell.setAttribute('aria-sort', 'none'));
        header.setAttribute('aria-sort', direction);
        body.append(...sortRows(Array.from(body.rows), columnIndex, direction));
      });
    });
  });
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initSortableTables(document), { once: true });
  } else {
    initSortableTables(document);
  }
}

if (typeof module === 'object' && module.exports) {
  module.exports = { compareValues, sortRows, initSortableTables };
}