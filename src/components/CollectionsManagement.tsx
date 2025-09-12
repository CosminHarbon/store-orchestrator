import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Folder, Plus, Upload, Edit, Trash2, Save, X, Image as ImageIcon, Search, Grid3X3, List, Sparkles, Zap } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
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
  const isMobile = useIsMobile();
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
    <Card className={`${isMobile ? 'mobile-futuristic-container border-none shadow-none bg-transparent' : ''}`}>
      <CardHeader className={`${isMobile ? 'relative z-10' : ''}`}>
        <CardTitle className={`flex items-center gap-2 ${isMobile ? 'text-3xl font-bold animate-fade-in' : ''}`}>
          {isMobile ? (
            <div className="flex items-center gap-2 text-gradient bg-gradient-to-r from-primary via-primary-glow to-accent bg-clip-text text-transparent">
              <Sparkles className="h-8 w-8 text-primary animate-pulse" />
              Collections
              <Zap className="h-8 w-8 text-accent animate-pulse" />
            </div>
          ) : (
            <>
              <Folder className="h-5 w-5" />
              Collections Management
            </>
          )}
        </CardTitle>
        <CardDescription className={`${isMobile ? 'text-lg animate-fade-in delay-200' : ''}`}>
          {isMobile 
            ? '🚀 Create and manage product collections with futuristic style'
            : 'Create and manage product collections. Products can belong to multiple collections.'
          }
        </CardDescription>
      </CardHeader>
      <CardContent className={`${isMobile ? 'relative z-10 px-4' : ''}`}>
        {/* Search and View Controls */}
        <div className={`flex flex-col gap-4 mb-6 ${isMobile ? 'gap-6' : ''}`}>
          <div className="flex flex-col sm:flex-row gap-4 justify-between">
            {/* Search Bar */}
            <div className={`relative flex-1 max-w-sm ${isMobile ? 'max-w-full' : ''}`}>
              <Search className={`absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 ${isMobile ? 'text-primary animate-pulse' : 'text-muted-foreground'}`} />
              <Input
                placeholder={isMobile ? "🔍 Search your collections..." : "Search collections..."}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`${isMobile 
                  ? 'pl-12 bg-gradient-to-r from-card/80 to-card/40 backdrop-blur-xl border border-white/20 rounded-2xl shadow-2xl text-foreground placeholder:text-muted-foreground/70 focus:border-primary/50 focus:shadow-glow' 
                  : 'pl-10'
                }`}
              />
            </div>

            {/* View Toggle and Create Button */}
            <div className="flex gap-2">
              {!isMobile && (
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
              )}
              {!isMobile && (
                <Button onClick={() => setIsCreateDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Collection
                </Button>
              )}
            </div>
          </div>
          
          {/* Mobile View Toggle */}
          {isMobile && (
            <div className="flex justify-center">
              <div className="flex rounded-2xl border border-white/20 p-1 bg-gradient-to-r from-card/80 to-card/40 backdrop-blur-xl shadow-2xl">
                <Button
                  variant={viewMode === 'grid' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('grid')}
                  className={`h-10 px-6 rounded-xl ${viewMode === 'grid' ? 'bg-gradient-to-r from-primary to-accent text-white shadow-lg' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  <Grid3X3 className="h-4 w-4 mr-2" />
                  Grid
                </Button>
                <Button
                  variant={viewMode === 'list' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('list')}
                  className={`h-10 px-6 rounded-xl ${viewMode === 'list' ? 'bg-gradient-to-r from-primary to-accent text-white shadow-lg' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  <List className="h-4 w-4 mr-2" />
                  List
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Floating Action Button for Mobile */}
        {isMobile && (
          <Button 
            onClick={() => setIsCreateDialogOpen(true)}
            className="fixed bottom-20 right-6 z-50 w-14 h-14 rounded-full p-0 bg-gradient-to-br from-primary via-primary-glow to-accent shadow-2xl border-0 hover:scale-110 hover:shadow-glow transition-all duration-300 hover:animate-pulse"
          >
            <Plus className="h-8 w-8" />
          </Button>
        )}

        {/* Collections Display */}
        {viewMode === 'grid' ? (
          // Grid View
          <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 ${isMobile ? 'gap-6 px-2' : ''}`}>
            {filteredCollections?.map((collection) => (
              <Card 
                key={collection.id} 
                className={`overflow-hidden ${isMobile 
                  ? 'bg-gradient-to-br from-card/80 to-card/40 backdrop-blur-xl border border-white/20 rounded-3xl shadow-2xl hover:shadow-glow transition-all duration-500 hover:scale-[1.02] hover:bg-gradient-to-br hover:from-card/90 hover:to-card/50' 
                  : ''
                }`}
              >
                <div className={`aspect-video relative overflow-hidden ${isMobile ? 'rounded-t-3xl' : 'bg-muted'}`}>
                  {collection.image_url ? (
                    <img
                      src={collection.image_url}
                      alt={collection.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className={`w-full h-full flex items-center justify-center ${isMobile ? 'bg-gradient-to-br from-primary/10 to-accent/10 backdrop-blur-sm' : 'bg-muted/50'}`}>
                      <div className="text-center">
                        <ImageIcon className={`h-12 w-12 mx-auto mb-2 ${isMobile ? 'text-primary animate-pulse' : 'text-muted-foreground'}`} />
                        <p className={`text-sm ${isMobile ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
                          {isMobile ? '✨ No image' : 'No image'}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
                <CardContent className={`${isMobile ? 'p-6' : 'p-4'}`}>
                  <div className={`flex justify-between items-start mb-2 ${isMobile ? 'gap-3' : ''}`}>
                    <h3 className={`font-semibold ${isMobile ? 'text-lg bg-gradient-to-r from-foreground to-muted-foreground bg-clip-text text-transparent' : ''}`}>
                      {collection.name}
                    </h3>
                    <Badge 
                      variant="secondary" 
                      className={`${isMobile 
                        ? 'bg-gradient-to-r from-primary/20 to-accent/20 text-primary border border-primary/30 rounded-full px-3 py-1 text-xs font-medium animate-pulse' 
                        : ''
                      }`}
                    >
                      {collection.product_count} product{collection.product_count !== 1 ? 's' : ''}
                    </Badge>
                  </div>
                  {collection.description && (
                    <p className={`text-sm mb-3 ${isMobile ? 'text-muted-foreground/80 leading-relaxed' : 'text-muted-foreground'}`}>
                      {collection.description}
                    </p>
                  )}
                  <div className={`flex gap-2 ${isMobile ? 'gap-3' : ''}`}>
                    <Button 
                      size="sm" 
                      variant="outline" 
                      onClick={() => handleEdit(collection)}
                      className={`${isMobile 
                        ? 'border-white/30 bg-white/10 backdrop-blur-sm hover:bg-white/20 hover:scale-105 transition-all duration-300 rounded-full flex-1' 
                        : ''
                      }`}
                    >
                      <Edit className="h-3 w-3 mr-1" />
                      Edit
                    </Button>
                    <Button 
                      size="sm" 
                      variant="outline" 
                      onClick={() => handleManageProducts(collection)}
                      className={`${isMobile 
                        ? 'border-white/30 bg-white/10 backdrop-blur-sm hover:bg-white/20 hover:scale-105 transition-all duration-300 rounded-full flex-1' 
                        : ''
                      }`}
                    >
                      <Folder className="h-3 w-3 mr-1" />
                      Products
                    </Button>
                    <Button 
                      size="sm" 
                      variant="destructive" 
                      onClick={() => handleDelete(collection)}
                      className={`${isMobile 
                        ? 'bg-red-500/20 border-red-300/30 text-red-400 hover:bg-red-500/30 hover:scale-105 transition-all duration-300 rounded-full w-12 h-8 p-0' 
                        : ''
                      }`}
                    >
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
            <div className={`sm:hidden space-y-2 ${isMobile ? 'space-y-6 px-2' : ''}`}>
              {filteredCollections?.map((collection) => (
                <Card 
                  key={collection.id} 
                  className={`${isMobile 
                    ? 'bg-gradient-to-br from-card/80 to-card/40 backdrop-blur-xl border border-white/20 rounded-3xl shadow-2xl hover:shadow-glow transition-all duration-500 hover:scale-[1.02] hover:bg-gradient-to-br hover:from-card/90 hover:to-card/50' 
                    : 'bg-gradient-card shadow-card border border-border/50'
                  }`}
                >
                  <CardContent className={`${isMobile ? 'p-6' : 'p-3'}`}>
                    <div className={`flex items-start justify-between mb-2 ${isMobile ? 'gap-4' : ''}`}>
                      <div className="flex-1 min-w-0">
                        <h3 className={`font-semibold text-sm truncate ${isMobile ? 'text-lg bg-gradient-to-r from-foreground to-muted-foreground bg-clip-text text-transparent' : ''}`}>
                          {collection.name}
                        </h3>
                        <Badge 
                          variant="secondary" 
                          className={`text-xs mt-1 ${isMobile 
                            ? 'bg-gradient-to-r from-primary/20 to-accent/20 text-primary border border-primary/30 rounded-full px-3 py-1 font-medium animate-pulse' 
                            : ''
                          }`}
                        >
                          {collection.product_count} product{collection.product_count !== 1 ? 's' : ''}
                        </Badge>
                      </div>
                    </div>
                    {collection.description && (
                      <p className={`text-xs mb-3 line-clamp-2 ${isMobile ? 'text-sm text-muted-foreground/80 leading-relaxed' : 'text-muted-foreground'}`}>
                        {collection.description}
                      </p>
                    )}
                    <div className={`flex gap-1 ${isMobile ? 'gap-3' : ''}`}>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        onClick={() => handleEdit(collection)} 
                        className={`${isMobile 
                          ? 'h-9 px-4 text-sm border-white/30 bg-white/10 backdrop-blur-sm hover:bg-white/20 hover:scale-105 transition-all duration-300 rounded-2xl flex-1' 
                          : 'h-7 px-2 text-xs'
                        }`}
                      >
                        <Edit className={`${isMobile ? 'h-4 w-4 mr-2' : 'h-3 w-3 mr-1'}`} />
                        Edit
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        onClick={() => handleManageProducts(collection)} 
                        className={`${isMobile 
                          ? 'h-9 px-4 text-sm border-white/30 bg-white/10 backdrop-blur-sm hover:bg-white/20 hover:scale-105 transition-all duration-300 rounded-2xl flex-1' 
                          : 'h-7 px-2 text-xs'
                        }`}
                      >
                        <Folder className={`${isMobile ? 'h-4 w-4 mr-2' : 'h-3 w-3 mr-1'}`} />
                        Products
                      </Button>
                      <Button 
                        size="sm" 
                        variant="destructive" 
                        onClick={() => handleDelete(collection)} 
                        className={`${isMobile 
                          ? 'h-9 px-4 bg-red-500/20 border-red-300/30 text-red-400 hover:bg-red-500/30 hover:scale-105 transition-all duration-300 rounded-2xl' 
                          : 'h-7 px-2'
                        }`}
                      >
                        <Trash2 className={`${isMobile ? 'h-4 w-4' : 'h-3 w-3'}`} />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        )}

        {filteredCollections?.length === 0 && !isLoading && (
          <div className={`text-center py-8 ${isMobile ? 'py-24 px-6' : 'text-gray-500'}`}>
            {isMobile ? (
              <div className="space-y-6 animate-fade-in">
                <div className="w-32 h-32 bg-gradient-to-br from-primary/20 via-accent/20 to-primary-glow/20 rounded-full flex items-center justify-center backdrop-blur-xl border border-white/20 shadow-2xl mx-auto animate-pulse">
                  <Folder className="h-16 w-16 text-primary animate-bounce" />
                </div>
                <div className="space-y-3">
                  <h3 className="text-2xl font-bold text-gradient bg-gradient-to-r from-foreground to-muted-foreground bg-clip-text text-transparent">
                    {searchQuery ? '🔍 No collections found' : '✨ No collections yet ✨'}
                  </h3>
                  <p className="text-base text-muted-foreground leading-relaxed max-w-md mx-auto">
                    {searchQuery 
                      ? 'Try a different search term or create a new collection.'
                      : '🚀 Create your first futuristic collection to organize your products in style.'
                    }
                  </p>
                </div>
              </div>
            ) : (
              searchQuery ? 'No collections match your search.' : 'No collections found. Create your first collection to get started.'
            )}
          </div>
        )}

        {/* Create Collection Dialog */}
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogContent className={`${isMobile ? 'max-w-[95vw] bg-background/95 backdrop-blur-xl border border-border/50 rounded-3xl shadow-2xl' : ''}`}>
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
          <DialogContent className={`${isMobile ? 'max-w-[95vw] bg-background/95 backdrop-blur-xl border border-border/50 rounded-3xl shadow-2xl' : ''}`}>
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
          <DialogContent className={`max-w-4xl ${isMobile ? 'max-w-[95vw] bg-background/95 backdrop-blur-xl border border-border/50 rounded-3xl shadow-2xl' : ''}`}>
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