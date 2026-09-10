PRAGMA foreign_keys = ON;

-- El número visible de un pedido Dux asistido no puede acreditar dos compras
-- distintas. Los vínculos históricos quedan fuera para no reinterpretar datos
-- previos. Dux sigue siendo la autoridad; este índice sólo evita doble enlace.
CREATE UNIQUE INDEX idx_dux_assisted_order_number_unique
  ON dux_order_links(company_id, branch_id, dux_order_number)
  WHERE verification_method = 'assisted_admin'
    AND dux_order_number IS NOT NULL;
