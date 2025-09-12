import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Folder, Plus, Upload, Edit, Trash2, Save, X, Image as ImageIcon, Search, Grid3X3, List } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import CollectionImageUpload from './CollectionImageUpload';

interface Collection {
  id: string;
  name: string;
  description: string;
  image_url: string;
  user_id: string;
  created_at: string;
  updated_at: string;
  product_count?: number;
}

interface Product {
  id: string;
  title: string;
  sku: string;
  price: number;
  category: string;
  is_in_collection?: boolean;
}

const CollectionsManagement = () => {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isProductsDialogOpen, setIsProductsDialogOpen] = useState(false);
  const [selectedCollection, setSelectedCollection] = useState<Collection | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    image_url: ''
  });

  const queryClient = useQueryClient();

  const { data: collections, isLoading } = useQuery({
    queryKey: ['collections'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('collections')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      
      // Get product counts for each collection
      const collectionsWithCounts = await Promise.all(
        data.map(async (collection) => {
          const { count } = await supabase
            .from('product_collections')
            .select('*', { count: 'exact', head: true })
            .eq('collection_id', collection.id);
          
          return {
            ...collection,
            product_count: count || 0
          };
        })
      );
      
      return collectionsWithCounts as Collection[];
    }
  });

  const { data: products } = useQuery({
    queryKey: ['products-for-collections'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('id, title, sku, price, category')
        .order('title');
      
      if (error) throw error;
      return data as Product[];
    }
  });

  const { data: collectionProducts, refetch: refetchCollectionProducts } = useQuery({
    queryKey: ['collection-products', selectedCollection?.id],
    queryFn: async () => {
      if (!selectedCollection) return [];
      
      const { data, error } = await supabase
        .from('product_collections')
        .select('product_id')
        .eq('collection_id', selectedCollection.id);
      
      if (error) throw error;
      
      const productIds = data.map((pc: any) => pc.product_id);
      
      return products?.map(product => ({
        ...product,
        is_in_collection: productIds.includes(product.id)
      })) || [];
    },
    enabled: !!selectedCollection && !!products
  });

  // Filter collections based on search query
  const filteredCollections = useMemo(() => {
    if (!collections || !searchQuery.trim()) return collections;
    
    const query = searchQuery.toLowerCase();
    return collections.filter(collection => 
      collection.name.toLowerCase().includes(query) ||
      (collection.description && collection.description.toLowerCase().includes(query))
    );
  }, [collections, searchQuery]);

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const { data: result, error } = await supabase
        .from('collections')
        .insert([{ ...data, user_id: (await supabase.auth.getUser()).data.user?.id }])
        .select()
        .single();
      
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      toast.success('Collection created successfully');
      setIsCreateDialogOpen(false);
      resetForm();
      queryClient.invalidateQueries({ queryKey: ['collections'] });
    },
    onError: (error: any) => {
      toast.error(`Failed to create collection: ${error.message}`);
    }
  });

  const updateMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const { data: result, error } = await supabase
        .from('collections')
        .update(data)
        .eq('id', selectedCollection?.id)
        .select()
        .single();
      
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      toast.success('Collection updated successfully');
      setIsEditDialogOpen(false);
      resetForm();
      queryClient.invalidateQueries({ queryKey: ['collections'] });
    },
    onError: (error: any) => {
      toast.error(`Failed to update collection: ${error.message}`);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('collections')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Collection deleted successfully');
      queryClient.invalidateQueries({ queryKey: ['collections'] });
    },
    onError: (error: any) => {
      toast.error(`Failed to delete collection: ${error.message}`);
    }
  });

  const updateProductCollectionMutation = useMutation({
    mutationFn: async ({ productId, inCollection }: { productId: string; inCollection: boolean }) => {
      if (!selectedCollection) return;
      
      if (inCollection) {
        const { error } = await supabase
          .from('product_collections')
          .insert([{ product_id: productId, collection_id: selectedCollection.id }]);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('product_collections')
          .delete()
          .eq('product_id', productId)
          .eq('collection_id', selectedCollection.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      refetchCollectionProducts();
      queryClient.invalidateQueries({ queryKey: ['collections'] });
    },
    onError: (error: any) => {
      toast.error(`Failed to update product collection: ${error.message}`);
    }
  });

  const resetForm = () => {
    setFormData({ name: '', description: '', image_url: '' });
    setSelectedCollection(null);
  };

  const handleEdit = (collection: Collection) => {
    setSelectedCollection(collection);
    setFormData({
      name: collection.name,
      description: collection.description || '',
      image_url: collection.image_url || ''
    });
    setIsEditDialogOpen(true);
  };

  const handleManageProducts = (collection: Collection) => {
    setSelectedCollection(collection);
    setIsProductsDialogOpen(true);
  };

  const handleDelete = (collection: Collection) => {
    if (confirm(`Are you sure you want to delete "${collection.name}"?`)) {
      deleteMutation.mutate(collection.id);
    }
  };

  const handleProductToggle = (productId: string, checked: boolean) => {
    updateProductCollectionMutation.mutate({ productId, inCollection: checked });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Folder className="h-5 w-5" />
          Collections Management
        </CardTitle>
        <CardDescription>
          Create and manage product collections. Products can belong to multiple collections.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Search and View Controls */}
        <div className="flex flex-col gap-4 mb-6">
          <div className="flex flex-col sm:flex-row gap-4 justify-between">
            {/* Search Bar */}
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search collections..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* View Toggle and Create Button */}
            <div className="flex gap-2">
              <div className="flex rounded-lg border border-border p-1">
                <Button
                  variant={viewMode === 'grid' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('grid')}
                  className="h-8 px-3"
                >
                  <Grid3X3 className="h-4 w-4" />
                </Button>
                <Button
                  variant={viewMode === 'list' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('list')}
                  className="h-8 px-3"
                >
                  <List className="h-4 w-4" />
                </Button>
              </div>
              <Button onClick={() => setIsCreateDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create Collection
              </Button>
            </div>
          </div>
        </div>

        {/* Collections Display */}
        {viewMode === 'grid' ? (
          // Grid View
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredCollections?.map((collection) => (
              <Card key={collection.id} className="overflow-hidden">
                <div className="aspect-video relative overflow-hidden bg-muted">
                  {collection.image_url ? (
                    <img
                      src={collection.image_url}
                      alt={collection.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-muted/50">
                      <div className="text-center">
                        <ImageIcon className="h-12 w-12 text-muted-foreground mx-auto mb-2" />
                        <p className="text-sm text-muted-foreground">No image</p>
                      </div>
                    </div>
                  )}
                </div>
                <CardContent className="p-4">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-semibold">{collection.name}</h3>
                    <Badge variant="secondary">{collection.product_count} products</Badge>
                  </div>
                  {collection.description && (
                    <p className="text-sm text-muted-foreground mb-3">{collection.description}</p>
                  )}
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => handleEdit(collection)}>
                      <Edit className="h-3 w-3 mr-1" />
                      Edit
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleManageProducts(collection)}>
                      <Folder className="h-3 w-3 mr-1" />
                      Products
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => handleDelete(collection)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          // List View
          <>
            <div className="hidden sm:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">Image</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Products</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="w-32">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCollections?.map((collection) => (
                    <TableRow key={collection.id}>
                      <TableCell>
                        <div className="w-12 h-12 rounded-md overflow-hidden bg-muted flex items-center justify-center">
                          {collection.image_url ? (
                            <img
                              src={collection.image_url}
                              alt={collection.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <ImageIcon className="h-6 w-6 text-muted-foreground" />
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">{collection.name}</TableCell>
                      <TableCell className="max-w-xs truncate">{collection.description || '-'}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{collection.product_count}</Badge>
                      </TableCell>
                      <TableCell>{new Date(collection.created_at).toLocaleDateString()}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button size="sm" variant="outline" onClick={() => handleEdit(collection)}>
                            <Edit className="h-3 w-3" />
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => handleManageProducts(collection)}>
                            <Folder className="h-3 w-3" />
                          </Button>
                          <Button size="sm" variant="destructive" onClick={() => handleDelete(collection)}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            
            {/* Mobile List View */}
            <div className="sm:hidden space-y-2">
              {filteredCollections?.map((collection) => (
                <Card key={collection.id} className="bg-gradient-card shadow-card border border-border/50">
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-sm truncate">{collection.name}</h3>
                        <Badge variant="secondary" className="text-xs mt-1">{collection.product_count} products</Badge>
                      </div>
                    </div>
                    {collection.description && (
                      <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{collection.description}</p>
                    )}
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" onClick={() => handleEdit(collection)} className="h-7 px-2 text-xs">
                        <Edit className="h-3 w-3 mr-1" />
                        Edit
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleManageProducts(collection)} className="h-7 px-2 text-xs">
                        <Folder className="h-3 w-3 mr-1" />
                        Products
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => handleDelete(collection)} className="h-7 px-2">
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        )}

        {filteredCollections?.length === 0 && !isLoading && (
          <div className="text-center text-gray-500 py-8">
            {searchQuery ? 'No collections match your search.' : 'No collections found. Create your first collection to get started.'}
          </div>
        )}

        {/* Create Collection Dialog */}
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Collection</DialogTitle>
              <DialogDescription>
                Create a new product collection with an optional image.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="name">Collection Name</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Enter collection name"
                />
              </div>
              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Enter collection description"
                  className="text-base md:text-sm"
                />
              </div>
              <div>
                <Label>Collection Image</Label>
                <CollectionImageUpload
                  currentImageUrl={formData.image_url}
                  onImageChange={(imageUrl) => setFormData(prev => ({ ...prev, image_url: imageUrl }))}
                  onImageRemove={() => setFormData(prev => ({ ...prev, image_url: '' }))}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                Cancel
              </Button>
              <Button 
                onClick={() => createMutation.mutate(formData)}
                disabled={!formData.name || createMutation.isPending}
              >
                <Save className="h-4 w-4 mr-2" />
                Create Collection
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Collection Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Collection</DialogTitle>
              <DialogDescription>
                Update collection details and image.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="edit-name">Collection Name</Label>
                <Input
                  id="edit-name"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Enter collection name"
                />
              </div>
              <div>
                <Label htmlFor="edit-description">Description</Label>
                <Textarea
                  id="edit-description"
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Enter collection description"
                  className="text-base md:text-sm"
                />
              </div>
              <div>
                <Label>Collection Image</Label>
                <CollectionImageUpload
                  collectionId={selectedCollection?.id}
                  currentImageUrl={formData.image_url}
                  onImageChange={(imageUrl) => setFormData(prev => ({ ...prev, image_url: imageUrl }))}
                  onImageRemove={() => setFormData(prev => ({ ...prev, image_url: '' }))}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                Cancel
              </Button>
              <Button 
                onClick={() => updateMutation.mutate(formData)}
                disabled={!formData.name || updateMutation.isPending}
              >
                <Save className="h-4 w-4 mr-2" />
                Update Collection
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Manage Products Dialog */}
        <Dialog open={isProductsDialogOpen} onOpenChange={setIsProductsDialogOpen}>
          <DialogContent className="max-w-4xl">
            <DialogHeader>
              <DialogTitle>Manage Products in "{selectedCollection?.name}"</DialogTitle>
              <DialogDescription>
                Select which products should be included in this collection.
              </DialogDescription>
            </DialogHeader>
            <div className="max-h-96 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">Include</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead>Category</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {collectionProducts?.map((product) => (
                    <TableRow key={product.id}>
                      <TableCell>
                        <Checkbox
                          checked={product.is_in_collection}
                          onCheckedChange={(checked) => handleProductToggle(product.id, checked as boolean)}
                        />
                      </TableCell>
                      <TableCell className="font-medium">{product.title}</TableCell>
                      <TableCell>{product.sku || '-'}</TableCell>
                      <TableCell>{product.price.toFixed(2)} RON</TableCell>
                      <TableCell>{product.category || '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <DialogFooter>
              <Button onClick={() => setIsProductsDialogOpen(false)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
};

export default CollectionsManagement;