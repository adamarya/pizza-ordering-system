const gallery = [
  { src: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=1000&q=80', alt: 'Fresh pizza topped with vegetables and cheese', title: 'Fresh from the oven' },
  { src: 'https://images.unsplash.com/photo-1579751626657-72bc17010498?auto=format&fit=crop&w=1000&q=80', alt: 'Pizza being prepared on a work surface', title: 'Made with care' },
  { src: 'https://images.unsplash.com/photo-1571407970349-bc81e7e96d47?auto=format&fit=crop&w=1000&q=80', alt: 'Pizza with melted cheese and tomato', title: 'Classic favorites' },
  { src: 'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?auto=format&fit=crop&w=1000&q=80', alt: 'Whole pizza ready to share', title: 'Made for sharing' },
  { src: 'https://images.unsplash.com/photo-1579751626657-72bc17010498?auto=format&fit=crop&w=1000&q=80', alt: 'Pizza dough and ingredients', title: 'Quality ingredients' },
  { src: 'https://images.unsplash.com/photo-1593560708920-61dd98c46a4e?auto=format&fit=crop&w=1000&q=80', alt: 'Baked pizza with fresh toppings', title: 'Your next favorite' },
];

export function GalleryPage() {
  return (
    <section className="page">
      <h1>Photo gallery</h1>
      <p className="muted">A look at the food we love making. Gallery entries are rendered from a data list so images and captions can be maintained separately from the page layout.</p>
      <div className="gallery-grid">
        {gallery.map((item) => (
          <figure className="gallery-card" key={item.title}>
            <img src={item.src} alt={item.alt} loading="lazy" />
            <figcaption><strong>{item.title}</strong></figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
