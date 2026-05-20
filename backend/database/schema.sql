-- ============================================================
-- F.I.G - Funcionamiento Íntegro Gastronómico
-- Schema PostgreSQL para Supabase
-- ============================================================

-- Tabla de usuarios del sistema
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(50) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    name VARCHAR(100) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'waiter', 'chef')),
    is_active BOOLEAN DEFAULT true,
    station VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de ingredientes/bodega
CREATE TABLE IF NOT EXISTS ingredients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) UNIQUE NOT NULL,
    stock DECIMAL(10,2) DEFAULT 0,
    unit VARCHAR(20) DEFAULT 'u.',
    low_stock_threshold DECIMAL(10,2) DEFAULT 10,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de productos del menú
CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) UNIQUE NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    category VARCHAR(50) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de recetas (relación muchos-a-muchos productos-ingredientes)
CREATE TABLE IF NOT EXISTS recipes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(product_id)
);

-- Tabla de detalle de recetas (ingredientes requeridos por producto)
CREATE TABLE IF NOT EXISTS recipe_ingredients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    ingredient_id UUID NOT NULL REFERENCES ingredients(id) ON DELETE RESTRICT,
    quantity_required DECIMAL(10,2) NOT NULL,
    UNIQUE(recipe_id, ingredient_id)
);

-- Tabla de mesas del restaurante
CREATE TABLE IF NOT EXISTS restaurant_tables (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_number INTEGER NOT NULL UNIQUE,
    capacity INTEGER DEFAULT 4,
    status VARCHAR(20) DEFAULT 'available' CHECK (status IN ('available', 'occupied', 'reserved', 'maintenance')),
    position_x INTEGER,
    position_y INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de órdenes
CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_id UUID REFERENCES restaurant_tables(id),
    session_id VARCHAR(100),
    user_id UUID REFERENCES users(id),
    status VARCHAR(30) DEFAULT 'pending' CHECK (status IN ('pending', 'preparing', 'ready', 'delivered', 'paid', 'cancelled')),
    subtotal DECIMAL(10,2) DEFAULT 0,
    total DECIMAL(10,2) DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    paid_at TIMESTAMP WITH TIME ZONE
);

-- Tabla de detalle de órdenes (ítems de cada orden)
CREATE TABLE IF NOT EXISTS order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id),
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_price DECIMAL(10,2) NOT NULL,
    subtotal DECIMAL(10,2) NOT NULL,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tabla para agrupar mesas temporalmente (MERGE TABLES)
CREATE TABLE IF NOT EXISTS table_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id VARCHAR(100) NOT NULL,
    main_table_id UUID NOT NULL REFERENCES restaurant_tables(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(session_id, main_table_id)
);

-- Tabla de auditoría de inventario (logs de movimientos)
CREATE TABLE IF NOT EXISTS inventory_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ingredient_id UUID NOT NULL REFERENCES ingredients(id),
    order_id UUID REFERENCES orders(id),
    user_id UUID REFERENCES users(id),
    action VARCHAR(20) NOT NULL CHECK (action IN ('add', 'remove', 'adjust', 'expired')),
    quantity DECIMAL(10,2) NOT NULL,
    stock_before DECIMAL(10,2) NOT NULL,
    stock_after DECIMAL(10,2) NOT NULL,
    reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- ÍNDICES PARA OPTIMIZACIÓN
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_orders_table_id ON orders(table_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_recipe_id ON recipe_ingredients(recipe_id);
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_ingredient_id ON recipe_ingredients(ingredient_id);
CREATE INDEX IF NOT EXISTS idx_ingredients_low_stock ON ingredients(stock) WHERE stock < low_stock_threshold;

-- Limpiar duplicados existentes por nombre y habilitar unicidad
DO $$
DECLARE
  prod_rec RECORD;
  ingr_rec RECORD;
BEGIN
  FOR prod_rec IN (
    SELECT name, array_agg(id ORDER BY id) AS ids
    FROM products
    GROUP BY name
    HAVING COUNT(*) > 1
  ) LOOP
    UPDATE order_items
    SET product_id = prod_rec.ids[1]
    WHERE product_id = ANY(prod_rec.ids[2:array_upper(prod_rec.ids, 1)]);

    UPDATE recipes
    SET product_id = prod_rec.ids[1]
    WHERE product_id = ANY(prod_rec.ids[2:array_upper(prod_rec.ids, 1)]);
  END LOOP;

  DELETE FROM recipes r
  USING (
    SELECT (array_agg(id ORDER BY id))[1] AS keep_id, product_id
    FROM recipes
    GROUP BY product_id
    HAVING COUNT(*) > 1
  ) dup
  WHERE r.product_id = dup.product_id
    AND r.id <> dup.keep_id;

  FOR ingr_rec IN (
    SELECT name, array_agg(id ORDER BY id) AS ids
    FROM ingredients
    GROUP BY name
    HAVING COUNT(*) > 1
  ) LOOP
    UPDATE recipe_ingredients
    SET ingredient_id = ingr_rec.ids[1]
    WHERE ingredient_id = ANY(ingr_rec.ids[2:array_upper(ingr_rec.ids, 1)]);
  END LOOP;

  DELETE FROM recipe_ingredients ri
  USING (
    SELECT (array_agg(id ORDER BY id))[1] AS keep_id, recipe_id, ingredient_id
    FROM recipe_ingredients
    GROUP BY recipe_id, ingredient_id
    HAVING COUNT(*) > 1
  ) dup
  WHERE ri.recipe_id = dup.recipe_id
    AND ri.ingredient_id = dup.ingredient_id
    AND ri.id <> dup.keep_id;

  DELETE FROM products p
  USING (
    SELECT unnest(ids[2:array_upper(ids, 1)]) AS duplicate_id
    FROM (
      SELECT array_agg(id ORDER BY id) AS ids
      FROM products
      GROUP BY name
      HAVING COUNT(*) > 1
    ) sub
  ) pd
  WHERE p.id = pd.duplicate_id;

  DELETE FROM ingredients i
  USING (
    SELECT unnest(ids[2:array_upper(ids, 1)]) AS duplicate_id
    FROM (
      SELECT array_agg(id ORDER BY id) AS ids
      FROM ingredients
      GROUP BY name
      HAVING COUNT(*) > 1
    ) sub
  ) idd
  WHERE i.id = idd.duplicate_id;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_products_name_unique ON products(name);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ingredients_name_unique ON ingredients(name);

-- ============================================================
-- DATOS DE PRUEBA - USUARIOS
-- ============================================================
-- Contraseñas hasheadas con bcrypt (todas son: password123)
-- $2a$10$...

INSERT INTO users (username, password, name, role, is_active, station) VALUES
('admin', '$2a$06$wSllVqXL7i7E68QU25pUeuTmX8PbOEwseZ.fkRjwAMjtt.BHiKjjy', 'Administrador', 'admin', true, 'Oficina Central'),
('garzon', '$2a$06$wSllVqXL7i7E68QU25pUeuTmX8PbOEwseZ.fkRjwAMjtt.BHiKjjy', 'Garzón Turno 1', 'waiter', true, 'Terminal Comedor'),
('chef', '$2a$06$wSllVqXL7i7E68QU25pUeuTmX8PbOEwseZ.fkRjwAMjtt.BHiKjjy', 'Chef Principal', 'chef', true, 'Terminal Cocina')
ON CONFLICT (username) DO NOTHING;

-- ============================================================
-- DATOS DE PRUEBA - INGREDIENTES
-- ============================================================
INSERT INTO ingredients (name, stock, unit, low_stock_threshold) VALUES
('Hamburguesas de Carne', 40, 'u.', 10),
('Pan Brioche', 40, 'u.', 10),
('Papas', 100, 'u.', 15),
('Cerveza IPA (L)', 30, 'L', 5),
('Lechuga Romana', 4, 'u.', 5),
('Tomates', 12, 'u.', 5),
('Pepperoni', 20, 'u.', 5),
('Queso Cheddar', 40, 'u.', 10),
('Queso Mozzarella', 30, 'u.', 5),
('Pollo Grillado', 10, 'u.', 5),
('Cebollas', 10, 'u.', 5),
('Masa de Pizza', 10, 'u.', 3),
('Bebida Gaseosa', 50, 'u.', 10),
('Hielo', 100, 'u.', 20)
ON CONFLICT (name) DO UPDATE SET stock = EXCLUDED.stock, unit = EXCLUDED.unit, low_stock_threshold = EXCLUDED.low_stock_threshold;

-- ============================================================
-- DATOS DE PRUEBA - PRODUCTOS
-- ============================================================
INSERT INTO products (name, price, category) VALUES
('American Burger', 12000, 'Burgers'),
('Papas rústica', 6500, 'Sides'),
('Papas fritas', 6500, 'Sides'),
('Cerveza IPA', 4500, 'Drinks'),
('Cerveza Stout', 4500, 'Drinks'),
('Ensalada Cesar', 8000, 'Greens'),
('Pizza Margarita', 10000, 'Pizza'),
('Pizza Pepperoni', 12000, 'Pizza'),
('Gaseosa mediana', 2500, 'Drinks')
ON CONFLICT (name) DO UPDATE SET price = EXCLUDED.price, category = EXCLUDED.category;

-- ============================================================
-- DATOS DE PRUEBA - RECETAS
-- ============================================================
DO $$
DECLARE
    burger_prod_id UUID;
    fries_prod_id UUID;
    potato_prod_id UUID;
    beer1_prod_id UUID;
    beer2_prod_id UUID;
    salad_prod_id UUID;
    pizza1_prod_id UUID;
    pizza2_prod_id UUID;
    soda_prod_id UUID;
    burger_recipe_id UUID;
    fries_recipe_id UUID;
    potato_recipe_id UUID;
    beer1_recipe_id UUID;
    beer2_recipe_id UUID;
    salad_recipe_id UUID;
    pizza1_recipe_id UUID;
    pizza2_recipe_id UUID;
    soda_recipe_id UUID;
    beef_ing_id UUID;
    bun_ing_id UUID;
    potato_ing_id UUID;
    beer_ing_id UUID;
    lettuce_ing_id UUID;
    chicken_ing_id UUID;
    dough_ing_id UUID;
    pepperoni_ing_id UUID;
BEGIN
    -- Obtener IDs de productos
    SELECT id INTO burger_prod_id FROM products WHERE name = 'American Burger';
    SELECT id INTO potato_prod_id FROM products WHERE name = 'Papas rústica';
    SELECT id INTO fries_prod_id FROM products WHERE name = 'Papas fritas';
    SELECT id INTO beer1_prod_id FROM products WHERE name = 'Cerveza IPA';
    SELECT id INTO beer2_prod_id FROM products WHERE name = 'Cerveza Stout';
    SELECT id INTO salad_prod_id FROM products WHERE name = 'Ensalada Cesar';
    SELECT id INTO pizza1_prod_id FROM products WHERE name = 'Pizza Margarita';
    SELECT id INTO pizza2_prod_id FROM products WHERE name = 'Pizza Pepperoni';
    SELECT id INTO soda_prod_id FROM products WHERE name = 'Gaseosa mediana';
    
    -- Obtener IDs de ingredientes
    SELECT id INTO beef_ing_id FROM ingredients WHERE name = 'Hamburguesas de Carne';
    SELECT id INTO bun_ing_id FROM ingredients WHERE name = 'Pan Brioche';
    SELECT id INTO potato_ing_id FROM ingredients WHERE name = 'Papas';
    SELECT id INTO beer_ing_id FROM ingredients WHERE name = 'Cerveza IPA (L)';
    SELECT id INTO lettuce_ing_id FROM ingredients WHERE name = 'Lechuga Romana';
    SELECT id INTO chicken_ing_id FROM ingredients WHERE name = 'Pollo Grillado';
    SELECT id INTO dough_ing_id FROM ingredients WHERE name = 'Masa de Pizza';
    SELECT id INTO pepperoni_ing_id FROM ingredients WHERE name = 'Pepperoni';
    
    -- Crear recetas
    INSERT INTO recipes (product_id)
    VALUES (burger_prod_id)
    ON CONFLICT (product_id) DO UPDATE SET product_id = EXCLUDED.product_id
    RETURNING id INTO burger_recipe_id;

    INSERT INTO recipes (product_id)
    VALUES (potato_prod_id)
    ON CONFLICT (product_id) DO UPDATE SET product_id = EXCLUDED.product_id
    RETURNING id INTO potato_recipe_id;

    INSERT INTO recipes (product_id)
    VALUES (fries_prod_id)
    ON CONFLICT (product_id) DO UPDATE SET product_id = EXCLUDED.product_id
    RETURNING id INTO fries_recipe_id;

    INSERT INTO recipes (product_id)
    VALUES (beer1_prod_id)
    ON CONFLICT (product_id) DO UPDATE SET product_id = EXCLUDED.product_id
    RETURNING id INTO beer1_recipe_id;

    INSERT INTO recipes (product_id)
    VALUES (beer2_prod_id)
    ON CONFLICT (product_id) DO UPDATE SET product_id = EXCLUDED.product_id
    RETURNING id INTO beer2_recipe_id;

    INSERT INTO recipes (product_id)
    VALUES (salad_prod_id)
    ON CONFLICT (product_id) DO UPDATE SET product_id = EXCLUDED.product_id
    RETURNING id INTO salad_recipe_id;

    INSERT INTO recipes (product_id)
    VALUES (pizza1_prod_id)
    ON CONFLICT (product_id) DO UPDATE SET product_id = EXCLUDED.product_id
    RETURNING id INTO pizza1_recipe_id;

    INSERT INTO recipes (product_id)
    VALUES (pizza2_prod_id)
    ON CONFLICT (product_id) DO UPDATE SET product_id = EXCLUDED.product_id
    RETURNING id INTO pizza2_recipe_id;

    INSERT INTO recipes (product_id)
    VALUES (soda_prod_id)
    ON CONFLICT (product_id) DO UPDATE SET product_id = EXCLUDED.product_id
    RETURNING id INTO soda_recipe_id;

    -- Asignar ingredientes a recetas
    INSERT INTO recipe_ingredients (recipe_id, ingredient_id, quantity_required) VALUES
        (burger_recipe_id, beef_ing_id, 2),
        (burger_recipe_id, bun_ing_id, 1)
    ON CONFLICT (recipe_id, ingredient_id) DO UPDATE SET quantity_required = EXCLUDED.quantity_required;

    INSERT INTO recipe_ingredients (recipe_id, ingredient_id, quantity_required) VALUES
        (potato_recipe_id, potato_ing_id, 3),
        (fries_recipe_id, potato_ing_id, 3),
        (beer1_recipe_id, beer_ing_id, 1),
        (beer2_recipe_id, beer_ing_id, 1),
        (salad_recipe_id, lettuce_ing_id, 1),
        (salad_recipe_id, chicken_ing_id, 1),
        (pizza1_recipe_id, dough_ing_id, 1),
        (pizza2_recipe_id, dough_ing_id, 1),
        (pizza2_recipe_id, pepperoni_ing_id, 2)
    ON CONFLICT (recipe_id, ingredient_id) DO UPDATE SET quantity_required = EXCLUDED.quantity_required;
END $$;

-- ============================================================
-- DATOS DE PRUEBA - MESAS
-- ============================================================
INSERT INTO restaurant_tables (table_number, capacity, status, position_x, position_y) VALUES
(1, 4, 'available', 1, 1),
(2, 4, 'available', 1, 2),
(3, 6, 'available', 1, 3),
(4, 2, 'available', 2, 1),
(5, 8, 'available', 2, 2),
(6, 4, 'available', 2, 3),
(7, 4, 'available', 3, 1),
(8, 6, 'available', 3, 2),
(9, 2, 'available', 3, 3),
(10, 4, 'available', 4, 1),
(11, 6, 'available', 4, 2),
(12, 4, 'available', 4, 3)
ON CONFLICT (table_number) DO NOTHING;

-- ============================================================
-- FUNCIÓN: Verificar stock disponible para un producto
-- ============================================================
CREATE OR REPLACE FUNCTION check_product_availability(p_product_id UUID)
RETURNS TABLE (
    available BOOLEAN,
    missing_ingredient VARCHAR,
    required_qty DECIMAL,
    available_qty DECIMAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        CASE 
            WHEN COALESCE(ing.stock, 0) >= ri.quantity_required THEN true
            ELSE false
        END as available,
        COALESCE(ing.name, 'Unknown') as missing_ingredient,
        ri.quantity_required as required_qty,
        COALESCE(ing.stock, 0) as available_qty
    FROM recipe_ingredients ri
    JOIN recipes r ON ri.recipe_id = r.id
    LEFT JOIN ingredients ing ON ri.ingredient_id = ing.id
    WHERE r.product_id = p_product_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- FUNCIÓN: Obtener ingresos del día
-- ============================================================
CREATE OR REPLACE FUNCTION get_daily_revenue(p_date DATE DEFAULT CURRENT_DATE)
RETURNS TABLE (
    total_revenue DECIMAL,
    order_count INTEGER,
    avg_ticket DECIMAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COALESCE(SUM(o.total), 0) as total_revenue,
        COUNT(o.id)::INTEGER as order_count,
        CASE 
            WHEN COUNT(o.id) > 0 THEN COALESCE(SUM(o.total), 0) / COUNT(o.id)
            ELSE 0
        END as avg_ticket
    FROM orders o
    WHERE DATE(o.paid_at) = p_date
    AND o.status = 'paid';
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- VISTA: Pedidos pendientes en cocina (KDS)
-- ============================================================
CREATE OR REPLACE VIEW kds_orders AS
SELECT 
    o.id,
    o.table_id,
    rt.table_number,
    o.status,
    o.created_at,
    EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - o.created_at))/60 as minutes_pending,
    json_agg(json_build_object(
        'product_id', oi.product_id,
        'product_name', p.name,
        'quantity', oi.quantity,
        'notes', oi.notes
    )) as items
FROM orders o
LEFT JOIN restaurant_tables rt ON o.table_id = rt.id
JOIN order_items oi ON o.id = oi.order_id
JOIN products p ON oi.product_id = p.id
WHERE o.status IN ('pending', 'preparing')
GROUP BY o.id, rt.table_number;

-- ============================================================
-- VISTA: Alertas de stock bajo
-- ============================================================
CREATE OR REPLACE VIEW low_stock_alerts AS
SELECT 
    id,
    name,
    stock,
    unit,
    low_stock_threshold,
    CASE 
        WHEN stock = 0 THEN 'critical'
        WHEN stock < low_stock_threshold * 0.5 THEN 'critical'
        ELSE 'warning'
    END as severity
FROM ingredients
WHERE stock < low_stock_threshold;