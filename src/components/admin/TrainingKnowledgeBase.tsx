'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';

type Article = {
  id: string;
  title: string;
  slug: string;
  category: string | null;
  content_md: string;
  is_published: boolean;
};

export default function TrainingKnowledgeBase() {
  const [items, setItems] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [content, setContent] = useState('');
  const [query, setQuery] = useState('');
  const { toast } = useToast();

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (query) params.set('q', query);
      params.set('include_drafts', 'true');
      const res = await fetch(`/api/training/articles?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'Failed to load articles');
      setItems(data ?? []);
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [query]);

  const create = async () => {
    try {
      const res = await fetch('/api/training/articles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, slug, content_md: content, is_published: false }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'Failed to create article');
      setTitle('');
      setSlug('');
      setContent('');
      load();
      toast({ title: 'Articulo creado' });
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  const publish = async (id: string, isPublished: boolean) => {
    try {
      const res = await fetch('/api/training/articles', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, is_published: isPublished }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'Failed to update article');
      load();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-3">
        <h3 className="font-semibold">Nuevo Articulo</h3>
        <Input placeholder="Titulo" value={title} onChange={(e) => setTitle(e.target.value)} />
        <Input placeholder="Slug" value={slug} onChange={(e) => setSlug(e.target.value)} />
        <Textarea placeholder="Contenido markdown" value={content} onChange={(e) => setContent(e.target.value)} rows={5} />
        <Button onClick={create} disabled={!title || !slug || !content}>Crear Borrador</Button>
      </Card>

      <Card className="p-4 space-y-3">
        <Input placeholder="Buscar articulo" value={query} onChange={(e) => setQuery(e.target.value)} />
        {loading ? (
          <p className="text-sm text-muted-foreground">Cargando...</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin articulos.</p>
        ) : (
          <div className="space-y-2">
            {items.map((item) => (
              <div key={item.id} className="border rounded-md p-3 flex items-center justify-between gap-2">
                <div>
                  <p className="font-medium text-sm">{item.title}</p>
                  <p className="text-xs text-muted-foreground">/{item.slug} - {item.is_published ? 'Publicado' : 'Borrador'}</p>
                </div>
                <div className="flex gap-1">
                  {!item.is_published ? (
                    <Button size="sm" variant="outline" onClick={() => publish(item.id, true)}>Publicar</Button>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => publish(item.id, false)}>Despublicar</Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
