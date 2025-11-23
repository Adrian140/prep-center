    /*
      # Create reviews table
      1. Purpose: Store customer reviews/testimonials for dynamic display on the website.
      2. Schema: reviews (id, reviewer_name, rating, review_text, review_link, created_at)
      3. Security: RLS enabled with admin-only write access and public read access.
    */

    CREATE TABLE IF NOT EXISTS reviews (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      reviewer_name TEXT NOT NULL,
      rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
      review_text TEXT NOT NULL,
      review_link TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Enable Row Level Security
    ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

    -- Policies for reviews table
    CREATE POLICY "Anyone can view reviews"
      ON reviews FOR SELECT
      USING (true);

    CREATE POLICY "Admins can manage reviews"
      ON reviews FOR ALL
      USING (is_admin());

    -- Insert initial review data
    INSERT INTO reviews (id, reviewer_name, rating, review_text, review_link)
    VALUES (
      '00000000-0000-0000-0000-000000000001',
      'Alina Tamas',
      5,
      'Working with this prep center in France has been a game changer for my Amazon business. Their team is efficient, detail-oriented, and consistently delivers high-quality service. Every shipment is prepared accurately and on time, following all Amazon FBA and FBM requirements perfectly. What I appreciate most is the incredible support they offer to new sellers. The owner is very friendly, experienced, and genuinely willing to help you grow. If you’re just starting out, they provide valuable advice, explain the process clearly, and guide you through every step, which makes everything so much easier and less stressful. Communication is always quick and smooth, and I truly feel like I’m working with a reliable partner who cares about my business. I highly recommend this prep center to anyone selling on Amazon and looking for a dependable team in France!',
      'https://share.google/AAgH65Zfx9C1MAaRu'
    )
    ON CONFLICT (id) DO NOTHING;
  