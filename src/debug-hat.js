const { driver } = require('./configs/neo4j');

async function debugHatController() {
  const session = driver.session();
  
  try {
    // Get all available routes
    console.log("Listing all available routes...");
    const routesResult = await session.run('MATCH (h:Hat) RETURN h.route_id as id, h.route_number as number, h.route_name as name LIMIT 10');
    
    if (routesResult.records.length === 0) {
      console.log("No routes found in database!");
      return;
    }
    
    console.log(`Found ${routesResult.records.length} routes. First 10:`);
    routesResult.records.forEach(record => {
      console.log(`ID: ${record.get('id')}, Number: ${record.get('number')}, Name: ${record.get('name')}`);
    });
    
    // Use the first route ID for testing
    const firstRouteId = routesResult.records[0].get('id');
    console.log("\n=== Using route ID for testing:", firstRouteId);
    
    // Test fetching this route
    const hatResult = await session.run(
      'MATCH (h:Hat {route_id: $id}) RETURN h',
      { id: firstRouteId }
    );
    
    if (hatResult.records.length === 0) {
      console.log("Could not retrieve route:", firstRouteId);
      return;
    }
      
    console.log("Hat found:", JSON.stringify(hatResult.records[0].get('h').properties, null, 2));
      
    // Test fetching duraklar (stops)
    console.log("\nTesting hatGuzergahiniGetir...");
    const durakResult = await session.run(
      `MATCH (d:Durak)-[r:GÜZERGAH_ÜZERINDE]->(h:Hat {route_id: $id})
        RETURN d, r.yön as yon, r.sıra as sira
        ORDER BY r.yön, r.sıra
        LIMIT 5`,
      { id: firstRouteId }
    );
      
    console.log("Durak results found:", durakResult.records.length);
    if (durakResult.records.length > 0) {
      console.log("First durak:", JSON.stringify({
        ...durakResult.records[0].get('d').properties,
        yon: durakResult.records[0].get('yon'),
        sira: durakResult.records[0].get('sira')?.toNumber() || null
      }, null, 2));
    }
    
    // Check relationship direction
    console.log("\nChecking relationship direction...");
    const relDirectionResult = await session.run(
      `MATCH (d)-[r:GÜZERGAH_ÜZERINDE]->(h:Hat)
       RETURN count(r) as count1`
    );
    
    const relDirectionResult2 = await session.run(
      `MATCH (h:Hat)<-[r:GÜZERGAH_ÜZERINDE]-(d)
       RETURN count(r) as count2`
    );
    
    console.log(
      "Durak -> Hat relationships:", relDirectionResult.records[0]?.get('count1')?.toNumber() || 0,
      "Hat <- Durak relationships:", relDirectionResult2.records[0]?.get('count2')?.toNumber() || 0
    );
    
    // Test shape query
    console.log("\nTesting hatShapeGetir...");
    const shapeResult = await session.run(
      `MATCH (p:ShapeNoktasi)
       RETURN p.shape_id as id, p.lat as lat, p.lng as lng, p.sequence as sequence
       LIMIT 5`
    );
    
    console.log("Shape results found:", shapeResult.records.length);
    if (shapeResult.records.length > 0) {
      console.log("First shape point:", JSON.stringify({
        id: shapeResult.records[0].get('id'),
        lat: shapeResult.records[0].get('lat'),
        lng: shapeResult.records[0].get('lng'),
        sequence: shapeResult.records[0].get('sequence')?.toNumber() || null
      }, null, 2));
      
      // Check shape ID format
      const sampleShapeId = shapeResult.records[0].get('id');
      console.log("Sample shape ID:", sampleShapeId);
      
      // Get test route with same shape ID pattern
      if (sampleShapeId) {
        const routeIdPart = sampleShapeId.slice(0, -1);
        console.log("Testing shape query with route ID prefix:", routeIdPart);
        
        const shapeByRouteResult = await session.run(
          `MATCH (p:ShapeNoktasi)
           WHERE p.shape_id STARTS WITH $routeIdPart
           RETURN count(p) as count`,
          { routeIdPart }
        );
        
        console.log("Matching shape points:", shapeByRouteResult.records[0]?.get('count')?.toNumber() || 0);
      }
    }
    
    // Test schedule data
    console.log("\nTesting hatSaatBilgileriGetir...");
    const scheduleResult = await session.run(
      `MATCH (h:Hat {route_id: $id}) 
       RETURN h.weekday_times as weekday_times, 
              h.saturday_times as saturday_times, 
              h.sunday_times as sunday_times,
              h.yön as yon`,
      { id: firstRouteId }
    );
    
    console.log("Schedule results found:", scheduleResult.records.length);
    if (scheduleResult.records.length > 0) {
      console.log("Schedule data:", JSON.stringify({
        weekday_times: scheduleResult.records[0].get('weekday_times'),
        saturday_times: scheduleResult.records[0].get('saturday_times'),
        sunday_times: scheduleResult.records[0].get('sunday_times'),
        yon: scheduleResult.records[0].get('yon')
      }, null, 2));
    }
  } catch (error) {
    console.error("Error in debug script:", error);
  } finally {
    await session.close();
    await driver.close();
  }
}

debugHatController().then(() => console.log("Debug completed")); 