import React from "react";
import type { ProductComparison } from "../../shared/types";
import { colors } from "../styles";

interface ComparisonCardProps {
  comparison: ProductComparison;
}

const cellStyle: React.CSSProperties = {
  padding: "8px 10px",
  fontSize: "12px",
  borderBottom: `1px solid ${colors.borderGray}`,
  fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
  verticalAlign: "top",
};

const headerCellStyle: React.CSSProperties = {
  ...cellStyle,
  fontWeight: 600,
  color: colors.white,
  fontSize: "11px",
  letterSpacing: "1px",
  textTransform: "uppercase",
};

const labelCellStyle: React.CSSProperties = {
  ...cellStyle,
  color: colors.textSecondary,
  fontWeight: 500,
  width: "90px",
};

export function ComparisonCard({ comparison }: ComparisonCardProps) {
  const { products, comparison: data } = comparison;

  return (
    <div
      style={{
        background: colors.darkGray,
        border: `1px solid ${colors.borderGray}`,
        borderRadius: "4px",
        overflow: "hidden",
        marginTop: "8px",
      }}
    >
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          color: colors.textPrimary,
        }}
      >
        <thead>
          <tr>
            <th style={headerCellStyle}></th>
            {products.map((p) => (
              <th key={p.handle} style={headerCellStyle}>
                {p.title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={labelCellStyle}>Brand</td>
            {data.brands.map((b) => (
              <td key={b.handle} style={cellStyle}>{b.brand}</td>
            ))}
          </tr>
          <tr>
            <td style={labelCellStyle}>Price</td>
            {data.prices.map((p) => (
              <td key={p.handle} style={cellStyle}>
                {p.price}
                {p.compareAtPrice && (
                  <span style={{ textDecoration: "line-through", color: colors.textMuted, marginLeft: "6px", fontSize: "11px" }}>
                    {p.compareAtPrice}
                  </span>
                )}
              </td>
            ))}
          </tr>
          <tr>
            <td style={labelCellStyle}>Type</td>
            {data.productTypes.map((t) => (
              <td key={t.handle} style={cellStyle}>{t.type || "—"}</td>
            ))}
          </tr>
          <tr>
            <td style={labelCellStyle}>Sizes</td>
            {data.availableSizes.map((s) => (
              <td key={s.handle} style={cellStyle}>
                {s.sizes.length > 0 ? s.sizes.join(", ") : "—"}
              </td>
            ))}
          </tr>
          <tr>
            <td style={labelCellStyle}>Material</td>
            {data.materials.map((m) => (
              <td key={m.handle} style={cellStyle}>{m.material || "—"}</td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
