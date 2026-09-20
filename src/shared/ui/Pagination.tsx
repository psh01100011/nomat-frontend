import styles from './surface.module.css';

export function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}) {
  const safeTotalPages = Math.max(1, totalPages);

  const start = Math.max(0, Math.min(page - 2, safeTotalPages - 5));
  const pages = Array.from({ length: Math.min(5, safeTotalPages) }, (_, index) => start + index);

  return (
    <nav className={styles.pagination} aria-label="페이지 이동">
      {pages.map((pageNumber) => (
        <button
          className={`${styles.pageButton} ${page === pageNumber ? styles.pageButtonActive : ''}`}
          key={pageNumber}
          onClick={() => onChange(pageNumber)}
          type="button"
        >
          {pageNumber + 1}
        </button>
      ))}
    </nav>
  );
}
