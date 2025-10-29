import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  const { method } = req;
  const { authorization } = req.headers;

  if (!authorization) {
    return res.status(401).json({ error: 'Authorization header required' });
  }

  const token = authorization.replace('Bearer ', '');
  supabase.auth.setSession({ access_token: token });

  try {
    switch (method) {
      case 'GET':
        return await getBrands(req, res);
      case 'POST':
        return await createBrand(req, res);
      case 'PUT':
        return await updateBrand(req, res);
      case 'DELETE':
        return await deleteBrand(req, res);
      default:
        res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE']);
        return res.status(405).json({ error: `Method ${method} not allowed` });
    }
  } catch (error) {
    console.error('Brand API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function getBrands(req, res) {
  const { data: brands, error } = await supabase
    .from('brands')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  return res.status(200).json({ brands });
}

async function createBrand(req, res) {
  const { name, accounts = [], hashtags = [], keywords = [] } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Brand name is required' });
  }

  const { data: user } = await supabase.auth.getUser();
  if (!user?.user) {
    return res.status(401).json({ error: 'User not authenticated' });
  }

  const { data: brand, error } = await supabase
    .from('brands')
    .insert({
      user_id: user.user.id,
      name,
      accounts,
      hashtags,
      keywords
    })
    .select()
    .single();

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  return res.status(201).json({ brand });
}

async function updateBrand(req, res) {
  const { id } = req.query;
  const { name, accounts, hashtags, keywords } = req.body;

  if (!id) {
    return res.status(400).json({ error: 'Brand ID is required' });
  }

  const updateData = {};
  if (name !== undefined) updateData.name = name;
  if (accounts !== undefined) updateData.accounts = accounts;
  if (hashtags !== undefined) updateData.hashtags = hashtags;
  if (keywords !== undefined) updateData.keywords = keywords;

  const { data: brand, error } = await supabase
    .from('brands')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  return res.status(200).json({ brand });
}

async function deleteBrand(req, res) {
  const { id } = req.query;

  if (!id) {
    return res.status(400).json({ error: 'Brand ID is required' });
  }

  const { error } = await supabase
    .from('brands')
    .delete()
    .eq('id', id);

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  return res.status(200).json({ message: 'Brand deleted successfully' });
}