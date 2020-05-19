import { app, query, errorHandler } from 'mu';
import rdfDereferencer from "rdf-dereference";

import { PathFactory } from 'ldflex';
import ComunicaEngine from '@ldflex/comunica';
import { namedNode } from '@rdfjs/data-model';

/**
 * Extract the value from a literal.
 *
 * @param entity [NamedNode] Entity for which the value property will
 * be extracted.
 */
function extractValue( entity ) {
  return entity && entity.value;
}

/**
 * Context for understanding the published model.
 */
const context = {
  "@context": {
    "@vocab": "http://schema.org/",
    "type": "http://www.w3.org/1999/02/22-rdf-syntax-ns#type"
  }
};

/**
 * Create a single business instance by querying the store.
 *
 * @param uri [NamedNode] A NamedNode containing the business
 * subject URI.
 * @return A simple result object with a business description
 */
async function createBusinessInstance( uri, pathFactory ) {
  const result = {};

  const business = pathFactory.create({ subject: uri });

  result.name = extractValue(await business.name);
  result.description = extractValue(await business.description);
  result.url = extractValue(await business.url);
  result.email = extractValue(await business.email);
  result.image = extractValue(await business.image);
  result.telephone = extractValue(await business.telephone);
  result.uri = extractValue( uri );

  result.location = await createBusinessLocation( business );
  result.openingHoursSpecifications = await createBusinessOpeningHoursSpecifications( business );

  const types = [];
  for await (const type of business.type) {
    types.push( extractValue( await type ) );
  }

  result.types = types;

  return result;
}

/**
 * Creates the location for a business by querying the store.
 *
 * @param business [Object] The instance yielded by ldflex for
 * fetching instances.
 *
 * @return Object JSON object which contains the location
 * specification.
 */
async function createBusinessLocation( business ) {
  const location = {};

  location.streetAddress = extractValue( await business.location.streetAddress );
  location.postalCode = extractValue( await business.location.postalCode );
  location.city = extractValue( await business.location.addressLocality );
  location.country = extractValue( await business.location.country );
  location.uri = extractValue( await business.location );

  return location;
}

async function createBusinessOpeningHoursSpecifications( business ) {
  const specifications = [];

  for await (const openingHours of business.openingHoursSpecification) {
    const baseOpening = {
      uri: extractValue( openingHours ),
      opens: extractValue( await openingHours.opens ),
      closes: extractValue( await openingHours.closes ),
      validFrom: extractValue( await openingHours.validFrom ),
      validThrough: extractValue( await openingHours.validThrough ),
    };
    if( extractValue( await openingHours.dayOfWeek ) ){
      baseOpening["dayOfWeek"] = {
        uri: extractValue( await openingHours.dayOfWeek ),
        name: extractValue( await openingHours.dayOfWeek.name ),
        position: extractValue( await openingHours.dayOfWeek.position )
      };
    }
    specifications.push( baseOpening );
  }

  return specifications;
}


app.get('/triples', async function( req, res ) {
  if( !req.query.url ) {
    res
      .status(500)
      .send( JSON.stringify({ status: 400, message: "url query param not found in request" }));
    return;
  }
  const URL = req.query.url;
  try {
    let quadArray = [];
    const response = await rdfDereferencer.dereference( URL, { headers: { "Accept": "text/html" } } );

    await new Promise((success,failure) => {
      response
        .quads
        .on("data", (quad) => quadArray.push(quad) )
        .on("error", (message) => {
          console.warn(`Failed to pass through url ${URL}`);
          failure(message);
        })
        .on("end", () => {
          success( quadArray );
        });
    });
    res
      .status(200)
      .send(JSON.stringify( quadArray ));

  } catch (e) {
    console.error(`Error occurred calculating response for url ${URL}`);
    res
      .status(500)
      .send(JSON.stringify({ status: 500, message: "Something went wrong while getting the URL dereferenced." }));
  }
} );

app.get('/business', async function( req, res ) {
  if( !req.query.url ) {
    res
      .status(400)
      .send( JSON.stringify({ status: 400, message: "url query param not found in request" }) );
    return;
  }
  try {
    const URL = req.query.url;
    const queryEngine = new ComunicaEngine( URL, { headers: { "Accept": "text/html" } } );
    queryEngine._engine.invalidateHttpCache();
    const path = new PathFactory({ context, queryEngine });
    const businesses = [];
    const allBusinessQ = queryEngine.execute(`SELECT ?business WHERE { ?business a <http://schema.org/LocalBusiness>. }` );

    for await (const bindings of allBusinessQ) {
      const uri = bindings.get("?business");
      businesses.push(
        await createBusinessInstance( uri, path  )
      );
    }

    res
      .status(200)
      .send( JSON.stringify( businesses ) );
  } catch (error) {
    console.error("Something went wrong while processing request", error);
    res
      .status(500)
      .send( JSON.stringify({ status: 200, message: "Something went wrong while calculating the business" }) );
  }
});

app.use(errorHandler);
