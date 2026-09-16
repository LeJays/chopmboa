/**
 * Utilities for image handling, compression, and preset selection
 * Supports Cameroonian dishes and restaurant logos
 */

export function fileToDataUrl(file: File, maxWidth = 800, maxHeight = 800, quality = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("Le fichier sélectionné n'est pas une image valide."));
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      // If SVG, return as is
      if (file.type === "image/svg+xml") {
        resolve(result);
        return;
      }

      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxWidth || height > maxHeight) {
          if (width / maxWidth > height / maxHeight) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          } else {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(result);
          return;
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, 0, 0, width, height);

        const format = file.type === "image/png" ? "image/png" : "image/jpeg";
        resolve(canvas.toDataURL(format, quality));
      };
      img.onerror = () => resolve(result);
      img.src = result;
    };
    reader.onerror = () => reject(new Error("Échec de lecture du fichier image"));
    reader.readAsDataURL(file);
  });
}

export interface ImagePreset {
  id: string;
  name: string;
  url: string;
  category?: string;
}

export const DISH_IMAGE_PRESETS: ImagePreset[] = [
  {
    id: "poulet-dg",
    name: "Poulet DG",
    url: "https://images.unsplash.com/photo-1598515214211-89d3c73ae83b?w=600&auto=format&fit=crop&q=80",
    category: "Plats chauds"
  },
  {
    id: "ndole",
    name: "Ndolé Crevettes / Viande",
    url: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&auto=format&fit=crop&q=80",
    category: "Spécialités"
  },
  {
    id: "poisson-braise",
    name: "Poisson Braisé",
    url: "https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?w=600&auto=format&fit=crop&q=80",
    category: "Grillades"
  },
  {
    id: "soya-brochettes",
    name: "Soya & Brochettes",
    url: "https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=600&auto=format&fit=crop&q=80",
    category: "Grillades"
  },
  {
    id: "koki",
    name: "Koki & Plantain Vapeur",
    url: "https://images.unsplash.com/photo-1540420773420-3366772f4999?w=600&auto=format&fit=crop&q=80",
    category: "Spécialités"
  },
  {
    id: "beignets-haricot",
    name: "Beignets - Haricot (BHB)",
    url: "https://images.unsplash.com/photo-1509722747041-616f39b57569?w=600&auto=format&fit=crop&q=80",
    category: "Snacks"
  },
  {
    id: "cocktail-folere",
    name: "Jus de Bissap / Foléré",
    url: "https://images.unsplash.com/photo-1551024709-8f23befc6f87?w=600&auto=format&fit=crop&q=80",
    category: "Boissons"
  },
  {
    id: "biere-fraiche",
    name: "Boisson Fraîche",
    url: "https://images.unsplash.com/photo-1608270114095-2fa733d02e07?w=600&auto=format&fit=crop&q=80",
    category: "Boissons"
  }
];

export const RESTAURANT_LOGO_PRESETS: ImagePreset[] = [
  {
    id: "logo-gold-chef",
    name: "Chef Étoilé & Toque",
    url: "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=300&auto=format&fit=crop&q=80"
  },
  {
    id: "logo-grill",
    name: "Grill & Braise Prestige",
    url: "https://images.unsplash.com/photo-1544025162-d76694265947?w=300&auto=format&fit=crop&q=80"
  },
  {
    id: "logo-african-bistro",
    name: "Saveurs d'Afrique & Lounge",
    url: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=300&auto=format&fit=crop&q=80"
  },
  {
    id: "logo-cocktail-terrasse",
    name: "Terrasse & Gastronomie",
    url: "https://images.unsplash.com/photo-1552566626-52f8b828add9?w=300&auto=format&fit=crop&q=80"
  }
];
