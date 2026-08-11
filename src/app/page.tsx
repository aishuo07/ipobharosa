export default function Home() {
  return (
    <div className="wrap">
      <div className="masthead">
        <div className="masthead-top">
          <div className="brand">
            <span className="wordmark">IPODekho</span>
            <span className="eyebrow">Lot Size · GMP · Dates · Allotment</span>
          </div>
        </div>
      </div>
      <div style={{ marginTop: 48, maxWidth: 560 }}>
        <p className="section-label" style={{ marginTop: 0 }}>
          Under construction
        </p>
        <p style={{ fontSize: 15 }}>
          The IPO board is being wired up to real data. Check back soon.
        </p>
      </div>
      <footer className="page-foot">
        IPODekho tracks Indian IPOs — lot size, price band, subscription, and
        grey market premium (GMP), which is informal, unregulated dealer-street
        pricing, not a guarantee of listing price.
      </footer>
    </div>
  );
}
